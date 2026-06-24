import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  CreateScreenerPresetSchema,
  ScreenerPresetQuerySchema,
  ScreenerQuerySchema,
  tryGetTenant,
  UpdateScreenerPresetSchema,
  type TenantContext,
} from '@tv/core';
import { exchanges, screenerPresets, symbols } from '@tv/db/schema';
import { buildScreenerFilters, maybeWhere, readScreenerMetrics, sortBy } from '@tv/screener-engine';

export const screenerRoutes = new Hono()
  .get('/screener', zValidator('query', ScreenerQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');

    const rows = await db
      .select({
        id: symbols.id,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        country: symbols.country,
        sector: symbols.sector,
        industry: symbols.industry,
        active: symbols.active,
        metadata: symbols.metadata,
        exchange: exchanges.code,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(maybeWhere(buildScreenerFilters(q)))
      .orderBy(sortBy(q.sort, q.direction), symbols.ticker)
      .limit(q.limit);

    return c.json({
      results: rows.map(({ metadata, ...row }) => ({
        ...row,
        metrics: readScreenerMetrics(metadata),
      })),
    });
  })
  .get('/screener/presets', zValidator('query', ScreenerPresetQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const filters = [
      or(eq(screenerPresets.tenantId, tenant.tenantId), eq(screenerPresets.isPublic, true))!,
    ];
    if (q.assetClass) filters.push(eq(screenerPresets.assetClass, q.assetClass));

    const rows = await db
      .select({
        id: screenerPresets.id,
        tenantId: screenerPresets.tenantId,
        userId: screenerPresets.userId,
        name: screenerPresets.name,
        assetClass: screenerPresets.assetClass,
        query: screenerPresets.query,
        isPublic: screenerPresets.isPublic,
        createdAt: screenerPresets.createdAt,
        updatedAt: screenerPresets.updatedAt,
      })
      .from(screenerPresets)
      .where(and(...filters))
      .orderBy(desc(screenerPresets.updatedAt));

    return c.json({ presets: rows });
  })
  .post('/screener/presets', zValidator('json', CreateScreenerPresetSchema), async (c) => {
    const body = c.req.valid('json');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = ulid();

    await db.insert(screenerPresets).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      name: body.name,
      assetClass: body.assetClass,
      query: body.query,
      isPublic: body.isPublic,
    });

    return c.json({ id });
  })
  .patch('/screener/presets/:id', zValidator('json', UpdateScreenerPresetSchema), async (c) => {
    const body = c.req.valid('json');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    await db
      .update(screenerPresets)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.assetClass !== undefined ? { assetClass: body.assetClass } : {}),
        ...(body.query !== undefined ? { query: body.query } : {}),
        ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(screenerPresets.id, id), eq(screenerPresets.tenantId, tenant.tenantId)));

    return c.json({ ok: true });
  })
  .delete('/screener/presets/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    await db
      .delete(screenerPresets)
      .where(and(eq(screenerPresets.id, id), eq(screenerPresets.tenantId, tenant.tenantId)));

    return c.json({ ok: true });
  });
