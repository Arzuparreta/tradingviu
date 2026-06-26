import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc } from 'drizzle-orm';
import { layouts } from '@tv/db/schema';
import { ulid } from 'ulid';
import { LayoutConfigSchema, parseLayoutConfig } from '@tv/layout-sync';
import { NotFoundError, tryGetTenant, type TenantContext } from '@tv/core';

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  config: LayoutConfigSchema,
  isDefault: z.boolean().optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(80).optional(),
  config: LayoutConfigSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const layoutRoutes = new Hono()
  .get('/layouts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select()
      .from(layouts)
      .where(and(eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)))
      .orderBy(desc(layouts.isDefault), desc(layouts.updatedAt));
    return c.json({ layouts: rows.map((row) => ({ ...row, config: parseLayoutConfig(row.config) })) });
  })
  .get('/layouts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [row] = await db
      .select()
      .from(layouts)
      .where(and(eq(layouts.id, id), eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    if (!row) throw new NotFoundError('Layout not found');
    return c.json({ layout: { ...row, config: parseLayoutConfig(row.config) } });
  })
  .post('/layouts', zValidator('json', CreateBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const config = parseLayoutConfig(body.config);
    const id = ulid();
    if (body.isDefault) {
      await db
        .update(layouts)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    }
    await db.insert(layouts).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      name: body.name,
      config,
      isDefault: body.isDefault ?? false,
    });
    return c.json({ id });
  })
  .put('/layouts/:id', zValidator('json', UpdateBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db
      .select()
      .from(layouts)
      .where(and(eq(layouts.id, id), eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    if (!existing) throw new NotFoundError('Layout not found');

    if (body.isDefault) {
      await db
        .update(layouts)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    }

    const patch: Partial<typeof layouts.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.config !== undefined) patch.config = parseLayoutConfig(body.config);
    if (body.isDefault !== undefined) patch.isDefault = body.isDefault;

    await db
      .update(layouts)
      .set(patch)
      .where(and(eq(layouts.id, id), eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .delete('/layouts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .delete(layouts)
      .where(and(eq(layouts.id, id), eq(layouts.tenantId, tenant.tenantId), eq(layouts.userId, tenant.userId)));
    return c.json({ ok: true });
  });
