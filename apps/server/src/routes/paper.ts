import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import {
  CreatePaperAccountSchema,
  NotFoundError,
  PlacePaperOrderSchema,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { exchanges, paperAccounts, paperOrders, symbols } from '@tv/db/schema';
import { ulid } from 'ulid';
import { executePaperOrder } from '../services/paper-trading.js';
import { toDecimalText } from '../services/portfolio-engine.js';

const assertAccount = async (
  db: ReturnType<typeof import('@tv/db').createDb>,
  tenant: TenantContext,
  accountId: string,
) => {
  const [account] = await db
    .select()
    .from(paperAccounts)
    .where(and(eq(paperAccounts.id, accountId), eq(paperAccounts.tenantId, tenant.tenantId), eq(paperAccounts.userId, tenant.userId)))
    .limit(1);
  if (!account) throw new NotFoundError('Paper account not found');
  return account;
};

export const paperRoutes = new Hono()
  .get('/paper/accounts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select()
      .from(paperAccounts)
      .where(and(eq(paperAccounts.tenantId, tenant.tenantId), eq(paperAccounts.userId, tenant.userId)))
      .orderBy(desc(paperAccounts.createdAt));
    return c.json({ accounts: rows });
  })
  .post('/paper/accounts', zValidator('json', CreatePaperAccountSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const id = ulid();
    await db.insert(paperAccounts).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      name: body.name,
      balance: toDecimalText(body.balance),
      currency: body.currency,
      leverage: toDecimalText(body.leverage),
    });
    return c.json({ id });
  })
  .get('/paper/accounts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const account = await assertAccount(db, tenant, id);
    const orders = await db
      .select({
        id: paperOrders.id,
        symbolId: paperOrders.symbolId,
        side: paperOrders.side,
        type: paperOrders.type,
        quantity: paperOrders.quantity,
        price: paperOrders.price,
        status: paperOrders.status,
        filledAt: paperOrders.filledAt,
        fillPrice: paperOrders.fillPrice,
        fee: paperOrders.fee,
        createdAt: paperOrders.createdAt,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(paperOrders)
      .innerJoin(symbols, eq(symbols.id, paperOrders.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(paperOrders.tenantId, tenant.tenantId), eq(paperOrders.accountId, id)))
      .orderBy(desc(paperOrders.createdAt));
    return c.json({ account, orders });
  })
  .post('/paper/accounts/:id/orders', zValidator('json', PlacePaperOrderSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const accountId = c.req.param('id');
    const body = c.req.valid('json');
    const account = await assertAccount(db, tenant, accountId);
    const [symbol] = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.id, body.symbolId)).limit(1);
    if (!symbol) throw new ValidationError('Symbol not found');

    const fill = executePaperOrder(body);
    const currentBalance = Number(account.balance);
    const leverage = Number(account.leverage);
    if (!Number.isFinite(currentBalance) || !Number.isFinite(leverage)) {
      throw new ValidationError('Invalid account balance');
    }
    if (fill.cashDelta < 0 && Math.abs(fill.cashDelta) > currentBalance * leverage) {
      throw new ValidationError('Insufficient paper buying power');
    }

    const id = ulid();
    await db.insert(paperOrders).values({
      id,
      tenantId: tenant.tenantId,
      accountId,
      symbolId: body.symbolId,
      side: body.side,
      type: body.type,
      quantity: toDecimalText(body.quantity),
      ...(body.limitPrice !== undefined ? { price: toDecimalText(body.limitPrice) } : {}),
      status: fill.status,
      ...(fill.fillPrice !== undefined ? { fillPrice: toDecimalText(fill.fillPrice), filledAt: new Date() } : {}),
      fee: toDecimalText(fill.fee),
    });
    if (fill.status === 'filled') {
      await db
        .update(paperAccounts)
        .set({ balance: toDecimalText(currentBalance + fill.cashDelta) })
        .where(and(eq(paperAccounts.id, accountId), eq(paperAccounts.tenantId, tenant.tenantId)));
    }
    return c.json({ id, fill });
  });
