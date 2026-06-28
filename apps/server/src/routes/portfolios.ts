import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import {
  CreatePortfolioSchema,
  CreatePortfolioTransactionSchema,
  NotFoundError,
  UpdatePortfolioSchema,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { exchanges, holdings, portfolios, symbols, transactions } from '@tv/db/schema';
import { ulid } from 'ulid';
import { computeHoldings, toDecimalText, validatePortfolioTransaction } from '../services/portfolio-engine.js';
import { computePortfolioAnalytics, type AnalyticsPosition } from '@tv/portfolio-analytics';
import { getFreshBars } from '../services/market-data.js';

/** Latest close as a current-price proxy; falls back to `fallback` on failure. */
const lastPrice = async (
  db: ReturnType<typeof import('@tv/db').createDb>,
  symbolId: string,
  fallback: number,
): Promise<number> => {
  try {
    const close = (await getFreshBars(db, symbolId, '1m', { limit: 1 })).bars.at(-1)?.close;
    return typeof close === 'number' && Number.isFinite(close) && close > 0 ? close : fallback;
  } catch {
    return fallback;
  }
};

const assertPortfolio = async (
  db: ReturnType<typeof import('@tv/db').createDb>,
  tenant: TenantContext,
  portfolioId: string,
) => {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, tenant.userId), eq(portfolios.userId, tenant.userId)))
    .limit(1);
  if (!portfolio) throw new NotFoundError('Portfolio not found');
  return portfolio;
};

const rebuildHoldings = async (
  db: ReturnType<typeof import('@tv/db').createDb>,
  tenant: TenantContext,
  portfolioId: string,
) => {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.portfolioId, portfolioId)))
    .orderBy(asc(transactions.occurredAt));
  const computed = computeHoldings(rows);
  await db
    .delete(holdings)
    .where(and(eq(holdings.portfolioId, portfolioId)));
  if (computed.holdings.length > 0) {
    await db.insert(holdings).values(
      computed.holdings.map((holding) => ({
        portfolioId,
        symbolId: holding.symbolId,
        quantity: toDecimalText(holding.quantity),
        avgCost: toDecimalText(holding.avgCost),
        openedAt: new Date(),
      })),
    );
  }
  return computed;
};

export const portfolioRoutes = new Hono()
  .get('/portfolios', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.userId, tenant.userId), eq(portfolios.userId, tenant.userId)))
      .orderBy(asc(portfolios.name));
    return c.json({ portfolios: rows });
  })
  .post('/portfolios', zValidator('json', CreatePortfolioSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const id = ulid();
    await db.insert(portfolios).values({
      id,
      userId: tenant.userId,
      name: body.name,
      baseCurrency: body.baseCurrency,
    });
    return c.json({ id });
  })
  .get('/portfolios/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const portfolio = await assertPortfolio(db, tenant, id);
    const holdingRows = await db
      .select({
        id: holdings.id,
        symbolId: holdings.symbolId,
        quantity: holdings.quantity,
        avgCost: holdings.avgCost,
        openedAt: holdings.openedAt,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(holdings)
      .innerJoin(symbols, eq(symbols.id, holdings.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(holdings.portfolioId, id)));
    const txRows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.portfolioId, id)))
      .orderBy(asc(transactions.occurredAt));
    const metrics = computeHoldings(txRows).metrics;
    return c.json({ portfolio, holdings: holdingRows, transactions: txRows, metrics });
  })
  .get('/portfolios/:id/analytics', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await assertPortfolio(db, tenant, id);

    const rows = await db
      .select({
        symbolId: holdings.symbolId,
        quantity: holdings.quantity,
        avgCost: holdings.avgCost,
        ticker: symbols.ticker,
        assetClass: symbols.assetClass,
        sector: symbols.sector,
      })
      .from(holdings)
      .innerJoin(symbols, eq(symbols.id, holdings.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(holdings.portfolioId, id)));

    const positions: AnalyticsPosition[] = await Promise.all(
      rows.map(async (r): Promise<AnalyticsPosition> => {
        const avgCost = Number(r.avgCost);
        const quantity = Number(r.quantity);
        const price = await lastPrice(db, r.symbolId, avgCost);
        return {
          symbolId: r.symbolId,
          ticker: r.ticker,
          quantity,
          avgCost,
          price,
          assetClass: r.assetClass,
          sector: r.sector,
        };
      }),
    );

    return c.json({ analytics: computePortfolioAnalytics(positions) });
  })
  .patch('/portfolios/:id', zValidator('json', UpdatePortfolioSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    await assertPortfolio(db, tenant, id);
    const patch: Partial<typeof portfolios.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.baseCurrency !== undefined) patch.baseCurrency = body.baseCurrency;
    await db
      .update(portfolios)
      .set(patch)
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, tenant.userId), eq(portfolios.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .delete('/portfolios/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .delete(portfolios)
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, tenant.userId), eq(portfolios.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .post('/portfolios/:id/transactions', zValidator('json', CreatePortfolioTransactionSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const portfolioId = c.req.param('id');
    const body = c.req.valid('json');
    validatePortfolioTransaction(body);
    await assertPortfolio(db, tenant, portfolioId);
    const [symbol] = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.id, body.symbolId)).limit(1);
    if (!symbol) throw new ValidationError('Symbol not found');
    const id = ulid();
    await db.insert(transactions).values({
      id,
      portfolioId,
      symbolId: body.symbolId,
      side: body.side,
      quantity: toDecimalText(body.quantity),
      price: toDecimalText(body.price),
      fee: toDecimalText(body.fee),
      occurredAt: body.occurredAt,
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    const computed = await rebuildHoldings(db, tenant, portfolioId);
    return c.json({ id, holdings: computed.holdings, metrics: computed.metrics });
  });
