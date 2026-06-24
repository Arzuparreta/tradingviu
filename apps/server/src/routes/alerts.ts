import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import {
  AlertConditionSchema,
  CreateAlertSchema,
  EvaluateAlertSchema,
  NotFoundError,
  ValidationError,
  tryGetTenant,
  type AlertCondition,
  type Interval,
  type TenantContext,
} from '@tv/core';
import { alertHistory, alerts, exchanges, symbols } from '@tv/db/schema';
import { ulid } from 'ulid';
import { getProvider } from '../services/data.js';
import { evaluateAlertCondition } from '../services/alert-engine.js';

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

const collectIndicatorIntervals = (condition: AlertCondition): Interval[] => {
  if (condition.type === 'indicator') return [condition.interval];
  if (condition.type === 'multi') return condition.conditions.flatMap(collectIndicatorIntervals);
  return [];
};

export const alertRoutes = new Hono()
  .get('/alerts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select({
        id: alerts.id,
        symbolId: alerts.symbolId,
        name: alerts.name,
        kind: alerts.kind,
        condition: alerts.condition,
        channels: alerts.channels,
        active: alerts.active,
        expiresAt: alerts.expiresAt,
        lastFiredAt: alerts.lastFiredAt,
        createdAt: alerts.createdAt,
        updatedAt: alerts.updatedAt,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(alerts)
      .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(alerts.tenantId, tenant.tenantId), eq(alerts.userId, tenant.userId)))
      .orderBy(desc(alerts.updatedAt));
    return c.json({ alerts: rows });
  })
  .post('/alerts', zValidator('json', CreateAlertSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const [symbol] = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.id, body.symbolId)).limit(1);
    if (!symbol) throw new ValidationError('Symbol not found');

    const id = ulid();
    await db.insert(alerts).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      symbolId: body.symbolId,
      name: body.name,
      kind: body.condition.type,
      condition: body.condition,
      channels: body.channels,
      active: body.active,
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
    });
    return c.json({ id });
  })
  .patch('/alerts/:id', zValidator('json', CreateAlertSchema.partial()), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const patch: Partial<typeof alerts.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.condition !== undefined) {
      patch.condition = body.condition;
      patch.kind = body.condition.type;
    }
    if (body.channels !== undefined) patch.channels = body.channels;
    if (body.active !== undefined) patch.active = body.active;
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt;

    const rows = await db
      .update(alerts)
      .set(patch)
      .where(and(eq(alerts.id, id), eq(alerts.tenantId, tenant.tenantId), eq(alerts.userId, tenant.userId)))
      .returning({ id: alerts.id });
    if (rows.length === 0) throw new NotFoundError('Alert not found');
    return c.json({ ok: true });
  })
  .delete('/alerts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .delete(alerts)
      .where(and(eq(alerts.id, id), eq(alerts.tenantId, tenant.tenantId), eq(alerts.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .get('/alerts/:id/history', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const rows = await db
      .select()
      .from(alertHistory)
      .where(and(eq(alertHistory.alertId, id), eq(alertHistory.tenantId, tenant.tenantId)))
      .orderBy(desc(alertHistory.firedAt));
    return c.json({ history: rows });
  })
  .post('/alerts/:id/evaluate', zValidator('json', EvaluateAlertSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const [row] = await db
      .select({
        id: alerts.id,
        active: alerts.active,
        condition: alerts.condition,
        channels: alerts.channels,
        symbolId: alerts.symbolId,
        ticker: symbols.ticker,
        exchange: exchanges.code,
      })
      .from(alerts)
      .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(alerts.id, id), eq(alerts.tenantId, tenant.tenantId), eq(alerts.userId, tenant.userId)))
      .limit(1);
    if (!row) throw new NotFoundError('Alert not found');
    if (!row.active) throw new ValidationError('Cannot evaluate inactive alert');

    const condition = AlertConditionSchema.parse(row.condition);
    const provider = getProvider(ccxtMap[row.exchange] ?? 'binance');
    const intervals = collectIndicatorIntervals(condition);
    const interval: Interval = intervals[0] ?? '1h';
    const bars = await provider.fetchHistorical({ symbol: row.ticker, interval, limit: 300 });
    const lastBar = bars.at(-1);
    if (!lastBar && body.price === undefined) throw new ValidationError('No market price available');
    const price = body.price ?? lastBar!.close;
    const previousPrice = body.previousPrice ?? (bars.length > 1 ? bars.at(-2)?.close : undefined);
    const context = previousPrice === undefined ? { price, bars } : { price, previousPrice, bars };
    const result = evaluateAlertCondition(condition, context);

    if (result.fired) {
      const delivered: Record<string, boolean> = {};
      for (const channel of row.channels) {
        delivered[channel] = channel === 'in_app';
      }
      await db.insert(alertHistory).values({
        alertId: row.id,
        tenantId: tenant.tenantId,
        firedAt: new Date(),
        price: String(price),
        payload: result,
        delivered,
      });
      await db
        .update(alerts)
        .set({ lastFiredAt: new Date(), updatedAt: new Date() })
        .where(eq(alerts.id, row.id));
    }

    return c.json({ result });
  });
