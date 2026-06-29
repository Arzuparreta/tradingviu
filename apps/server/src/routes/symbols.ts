import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { symbols, exchanges, dataSubscriptions } from '@tv/db/schema';
import { DomQuerySchema, IntervalSchema, NotFoundError, tryGetUserContext, type UserContext } from '@tv/core';
import { getFreshBars, resolveMarketSymbol } from '../services/market-data.js';
import { getMarketStore } from '../services/market-store.js';

const QuerySchema = z.object({
  q: z.string().min(1).max(80),
  assetClass: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const HistoricalQuery = z.object({
  symbol: z.string().min(1),
  interval: IntervalSchema,
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  before: z.coerce.number().int().optional(),
  after: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(500),
});

export const symbolRoutes = new Hono()
  .get('/symbols/search', zValidator('query', QuerySchema), async (c) => {
    const { q, limit, assetClass } = c.req.valid('query');
    const db = c.get('db');
    const rows = await db
      .select({
        id: symbols.id,
        exchange: exchanges.code,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        active: symbols.active,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(assetClass ? eq(symbols.assetClass, assetClass) : undefined)
      .limit(limit);
    const filtered = rows.filter(
      (r: { ticker: string; name: string }) =>
        r.ticker.toLowerCase().includes(q.toLowerCase()) ||
        r.name.toLowerCase().includes(q.toLowerCase()),
    );
    return c.json({ results: filtered.length ? filtered : rows.slice(0, limit) });
  })
  .get('/symbols', async (c) => {
    const db = c.get('db');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500);
    const assetClass = c.req.query('assetClass');
    const rows = await db
      .select({
        id: symbols.id,
        exchange: exchanges.code,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        active: symbols.active,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(assetClass ? eq(symbols.assetClass, assetClass) : undefined)
      .limit(limit);
    return c.json({ results: rows });
  });

export const chartRoutes = new Hono()
  .get('/chart/history', zValidator('query', HistoricalQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const result = await getFreshBars(db, q.symbol, q.interval, {
      ...(q.from !== undefined ? { from: q.from } : {}),
      ...(q.to !== undefined ? { to: q.to } : {}),
      ...(q.before !== undefined ? { before: q.before } : {}),
      ...(q.after !== undefined ? { after: q.after } : {}),
      limit: q.limit,
    });

    const tenant = tryGetUserContext() as UserContext;
    const lastBar = result.bars.at(-1);
    await db
      .insert(dataSubscriptions)
      .values({
        userId: tenant.userId,
        symbolId: result.symbol.id,
        intervals: [q.interval],
        realtimeEnabled: true,
        lastBarAt: lastBar ? new Date(lastBar.time * 1000) : null,
      })
      .onConflictDoNothing();

    return c.json({
      symbol: result.symbol,
      interval: q.interval,
      bars: result.bars,
      source: result.source,
      asOf: result.asOf,
      fresh: result.fresh,
    });
  })
  .get('/chart/dom', zValidator('query', DomQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const resolved = await resolveMarketSymbol(db, q.symbol);
    if (resolved.provider !== 'binance') {
      throw new NotFoundError('Live depth is only available for Binance symbols', { symbol: q.symbol });
    }
    const book = await getMarketStore().fetchBookSnapshot(
      { provider: resolved.provider, ticker: resolved.providerTicker },
      q.levels,
    );
    return c.json({ symbol: resolved.symbol, book, source: 'binance-depth' as const });
  });
