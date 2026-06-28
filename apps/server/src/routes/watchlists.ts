import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, asc } from 'drizzle-orm';
import { watchlists, watchlistItems, symbols, exchanges } from '@tv/db/schema';
import { ulid } from 'ulid';
import { NotFoundError, ValidationError, tryGetTenant, type TenantContext } from '@tv/core';

const CreateBody = z.object({
  name: z.string().min(1).max(80),
});

const AddItemBody = z.object({
  symbol: z.string(),
  note: z.string().max(200).optional(),
  color: z.string().max(20).optional(),
});

const UpdateItemBody = z.object({
  color: z.string().max(20).optional(),
  note: z.string().max(200).optional(),
});

export const watchlistRoutes = new Hono()
  .get('/watchlists', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const lists = await db.select().from(watchlists).where(eq(watchlists.userId, tenant.userId));
    return c.json({ watchlists: lists });
  })
  .post('/watchlists', zValidator('json', CreateBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const id = ulid();
    await db.insert(watchlists).values({
      id,
      userId: tenant.userId,
      name: body.name,
    });
    return c.json({ id });
  })
  .delete('/watchlists/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .delete(watchlists)
      .where(and(eq(watchlists.id, id), eq(watchlists.userId, tenant.userId)));
    return c.json({ ok: true });
  })
  .get('/watchlists/:id/items', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const rows = await db
      .select({
        id: watchlistItems.id,
        symbolId: watchlistItems.symbolId,
        color: watchlistItems.color,
        note: watchlistItems.note,
        sortOrder: watchlistItems.sortOrder,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(watchlistItems)
      .innerJoin(symbols, eq(symbols.id, watchlistItems.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(eq(watchlistItems.watchlistId, id))
      .orderBy(asc(watchlistItems.sortOrder));
    return c.json({ items: rows });
  })
  .post('/watchlists/:id/items', zValidator('json', AddItemBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [list] = await db
      .select()
      .from(watchlists)
      .where(and(eq(watchlists.id, id), eq(watchlists.userId, tenant.userId)));
    if (!list) throw new NotFoundError('Watchlist not found');

    const [sym] = await db.select().from(symbols).where(eq(symbols.id, body.symbol));
    if (!sym) throw new ValidationError('Symbol not found');

    const count = await db
      .select({ id: watchlistItems.id })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, id));
    if (count.length >= 1000) {
      throw new ValidationError('Watchlist full (1000 symbols max)');
    }

    const itemId = ulid();
    const insertValues: typeof watchlistItems.$inferInsert = {
      id: itemId,
      watchlistId: id,
      symbolId: body.symbol,
      sortOrder: count.length,
    };
    if (body.color !== undefined) insertValues.color = body.color;
    if (body.note !== undefined) insertValues.note = body.note;
    try {
      await db.insert(watchlistItems).values(insertValues);
    } catch {
      throw new ValidationError('Symbol already in watchlist');
    }
    return c.json({ id: itemId });
  })
  .patch('/watchlists/:id/items/:itemId', zValidator('json', UpdateItemBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const itemId = c.req.param('itemId');
    const body = c.req.valid('json');
    await db
      .update(watchlistItems)
      .set({ ...(body.color !== undefined ? { color: body.color } : {}), ...(body.note !== undefined ? { note: body.note } : {}) })
      .where(and(eq(watchlistItems.id, itemId)));
    return c.json({ ok: true });
  })
  .delete('/watchlists/:id/items/:itemId', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const itemId = c.req.param('itemId');
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, itemId)));
    return c.json({ ok: true });
  });
