import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { plans, tenants, users, subscriptions, exchanges, symbols } from '@tv/db/schema';
import { ulid } from 'ulid';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { invalidatePlanCache } from '@tv/quotas';
import { applySubscriptionChange } from '@tv/billing';

const PlanBody = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(80),
  description: z.string().optional(),
  priceMonthlyCents: z.number().int().min(0).default(0),
  priceYearlyCents: z.number().int().min(0).default(0),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly: z.string().optional(),
  quotas: z.record(z.unknown()),
  features: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  isPublic: z.boolean().default(true),
});

const TenantPatch = z.object({
  planCode: z.string().optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
});

export const adminRoutes = new Hono()
  .get('/stats', async (c) => {
    const db = c.get('db');
    const [tenantsCount] = await db.execute<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM tenants`);
    const [usersCount] = await db.execute<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM users`);
    const [exchangesCount] = await db.execute<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM exchanges`);
    const [symbolsCount] = await db.execute<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM symbols`);
    return c.json({
      tenants: tenantsCount?.c ?? 0,
      users: usersCount?.c ?? 0,
      exchanges: exchangesCount?.c ?? 0,
      symbols: symbolsCount?.c ?? 0,
    });
  })
  .get('/plans', async (c) => {
    const db = c.get('db');
    const rows = await db.select().from(plans);
    return c.json({ plans: rows });
  })
  .post('/plans', zValidator('json', PlanBody), async (c) => {
    const db = c.get('db');
    const body = c.req.valid('json');
    const id = ulid();
    await db.insert(plans).values({ id, ...body } as never);
    invalidatePlanCache(body.code);
    return c.json({ ok: true, id });
  })
  .patch('/tenants/:id', zValidator('json', TenantPatch), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    if (body.status) {
      await db.update(tenants).set({ status: body.status, updatedAt: new Date() }).where(eq(tenants.id, id));
    }
    if (body.planCode) {
      await applySubscriptionChange(db, {
        tenantId: id as never,
        planCode: body.planCode,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      });
    }
    return c.json({ ok: true });
  })
  .get('/tenants', async (c) => {
    const db = c.get('db');
    const rows = await db.select().from(tenants);
    return c.json({ tenants: rows });
  })
  .get('/exchanges', async (c) => {
    const db = c.get('db');
    const rows = await db.select().from(exchanges);
    return c.json({ exchanges: rows });
  })
  .get('/symbols', async (c) => {
    const db = c.get('db');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 500);
    const rows = await db.select().from(symbols).limit(limit);
    return c.json({ symbols: rows });
  })
  .post('/search/reindex', async (c) => {
    const db = c.get('db');
    const { indexAllSymbols, searchEnabled } = await import('../services/search.js');
    if (!searchEnabled()) {
      return c.json({ ok: false, reason: 'MEILI_HOST not configured', indexed: 0 });
    }
    const indexed = await indexAllSymbols(db);
    return c.json({ ok: true, indexed });
  });
