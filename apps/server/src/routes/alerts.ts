import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import {
  AlertConditionSchema,
  CreateAlertSchema,
  EvaluateAlertSchema,
  NotFoundError,
  ValidationError,
  tryGetUserContext,
  type AlertCondition,
  type Interval,
  type UserContext,
} from '@tv/core';
import { alertHistory, alerts, exchanges, symbols } from '@tv/db/schema';
import { ulid } from 'ulid';
import { evaluateAlertCondition } from '../services/alert-engine.js';
import { buildAlertWebhookPayload, deliverWebhook, renderAlertEmail, deliverEmail } from '@tv/notifications';
import { getEmailTransport } from '../services/email.js';
import { getFreshBars } from '../services/market-data.js';

const collectIndicatorIntervals = (condition: AlertCondition): Interval[] => {
  if (condition.type === 'indicator') return [condition.interval];
  if (condition.type === 'multi') return condition.conditions.flatMap(collectIndicatorIntervals);
  return [];
};

export const alertRoutes = new Hono()
  .get('/alerts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const rows = await db
      .select({
        id: alerts.id,
        symbolId: alerts.symbolId,
        name: alerts.name,
        kind: alerts.kind,
        condition: alerts.condition,
        channels: alerts.channels,
        webhookUrl: alerts.webhookUrl,
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
      .where(and(eq(alerts.userId, tenant.userId), eq(alerts.userId, tenant.userId)))
      .orderBy(desc(alerts.updatedAt));
    return c.json({ alerts: rows });
  })
  .post('/alerts', zValidator('json', CreateAlertSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const body = c.req.valid('json');
    const [symbol] = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.id, body.symbolId)).limit(1);
    if (!symbol) throw new ValidationError('Symbol not found');

    const id = ulid();
    await db.insert(alerts).values({
      id,
      userId: tenant.userId,
      symbolId: body.symbolId,
      name: body.name,
      kind: body.condition.type,
      condition: body.condition,
      channels: body.channels,
      active: body.active,
      ...(body.webhookUrl !== undefined ? { webhookUrl: body.webhookUrl } : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
    });
    return c.json({ id });
  })
  .patch('/alerts/:id', zValidator('json', CreateAlertSchema.partial()), async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const patch: Partial<typeof alerts.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.condition !== undefined) {
      patch.condition = body.condition;
      patch.kind = body.condition.type;
    }
    if (body.channels !== undefined) patch.channels = body.channels;
    if (body.webhookUrl !== undefined) patch.webhookUrl = body.webhookUrl;
    if (body.active !== undefined) patch.active = body.active;
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt;

    const rows = await db
      .update(alerts)
      .set(patch)
      .where(and(eq(alerts.id, id), eq(alerts.userId, tenant.userId), eq(alerts.userId, tenant.userId)))
      .returning({ id: alerts.id });
    if (rows.length === 0) throw new NotFoundError('Alert not found');
    return c.json({ ok: true });
  })
  .delete('/alerts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const id = c.req.param('id');
    await db
      .delete(alerts)
      .where(and(eq(alerts.id, id), eq(alerts.userId, tenant.userId), eq(alerts.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .get('/alerts/:id/history', async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const id = c.req.param('id');
    const rows = await db
      .select()
      .from(alertHistory)
      .where(and(eq(alertHistory.alertId, id)))
      .orderBy(desc(alertHistory.firedAt));
    return c.json({ history: rows });
  })
  .post('/alerts/:id/evaluate', zValidator('json', EvaluateAlertSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetUserContext() as UserContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const [row] = await db
      .select({
        id: alerts.id,
        name: alerts.name,
        active: alerts.active,
        condition: alerts.condition,
        channels: alerts.channels,
        webhookUrl: alerts.webhookUrl,
        symbolId: alerts.symbolId,
        ticker: symbols.ticker,
        exchange: exchanges.code,
      })
      .from(alerts)
      .innerJoin(symbols, eq(symbols.id, alerts.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(alerts.id, id), eq(alerts.userId, tenant.userId), eq(alerts.userId, tenant.userId)))
      .limit(1);
    if (!row) throw new NotFoundError('Alert not found');
    if (!row.active) throw new ValidationError('Cannot evaluate inactive alert');

    const condition = AlertConditionSchema.parse(row.condition);
    const intervals = collectIndicatorIntervals(condition);
    const interval: Interval = intervals[0] ?? '1h';
    const bars = (await getFreshBars(db, row.symbolId, interval, { limit: 300 })).bars;
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
      const notification = {
        alertId: row.id,
        alertName: row.name,
        symbol: `${row.exchange}:${row.ticker}`,
        price,
        fired: result.fired,
        value: result.value,
        reason: result.reason,
        firedAt: new Date(),
      };
      // Outbound webhook delivery (native fetch; failures recorded as pending).
      if (row.channels.includes('webhook') && row.webhookUrl) {
        delivered['webhook'] = await deliverWebhook(
          row.webhookUrl,
          buildAlertWebhookPayload(notification),
          (url, init) => fetch(url, init),
        );
      }
      // Email delivery via SMTP (Mailpit) to the alert owner; off when unconfigured.
      if (row.channels.includes('email')) {
        const transport = getEmailTransport();
        const claims = c.get('claims') as { email: string };
        if (transport && claims.email) {
          const { subject, text } = renderAlertEmail(notification);
          delivered['email'] = await deliverEmail({ to: claims.email, subject, text }, transport);
        }
      }
      await db.insert(alertHistory).values({
        alertId: row.id,
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
