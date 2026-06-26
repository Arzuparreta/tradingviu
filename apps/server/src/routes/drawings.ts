import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { drawings as drawingsTable } from '@tv/db/schema';
import { DrawingsSchema } from '@tv/drawing-tools';
import { tryGetTenant, type TenantContext } from '@tv/core';
import { drawingToColumns, rowToDrawing } from '../services/drawings.js';

const legacyDrawingScope = (symbol: string, interval: string): string => `symbol:${symbol}:${interval}`;

/** A chart's drawings are scoped per (user, drawing scope, symbol, interval). */
const ScopeQuery = z.object({
  symbol: z.string().min(1).max(80),
  interval: z.string().min(1).max(16),
  scope: z.string().min(1).max(80).optional(),
});

const SaveBody = z.object({ drawings: DrawingsSchema });

export const drawingRoutes = new Hono()
  .get('/drawings', zValidator('query', ScopeQuery), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const { symbol, interval, scope } = c.req.valid('query');
    const scopeId = scope ?? legacyDrawingScope(symbol, interval);
    const rows = await db
      .select()
      .from(drawingsTable)
      .where(
        and(
          eq(drawingsTable.tenantId, tenant.tenantId),
          eq(drawingsTable.userId, tenant.userId),
          eq(drawingsTable.symbolId, symbol),
          eq(drawingsTable.interval, interval),
          eq(drawingsTable.scopeId, scopeId),
        ),
      );
    const drawings = rows
      .map((row) => rowToDrawing({ id: row.id, kind: row.kind, geometry: row.geometry, style: row.style }))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    return c.json({ drawings });
  })
  // Replace-all: the client owns the drawing set for a chart and saves the whole
  // array. The handler already runs inside a tenant transaction (RLS set), so the
  // delete + insert are atomic.
  .put('/drawings', zValidator('query', ScopeQuery), zValidator('json', SaveBody), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const { symbol, interval, scope } = c.req.valid('query');
    const scopeId = scope ?? legacyDrawingScope(symbol, interval);
    const { drawings } = c.req.valid('json');
    const now = new Date();

    await db
      .delete(drawingsTable)
      .where(
        and(
          eq(drawingsTable.tenantId, tenant.tenantId),
          eq(drawingsTable.userId, tenant.userId),
          eq(drawingsTable.symbolId, symbol),
          eq(drawingsTable.interval, interval),
          eq(drawingsTable.scopeId, scopeId),
        ),
      );

    if (drawings.length > 0) {
      await db.insert(drawingsTable).values(
        drawings.map((d) => {
          const cols = drawingToColumns(d);
          return {
            id: cols.id,
            tenantId: tenant.tenantId,
            userId: tenant.userId,
            symbolId: symbol,
            interval,
            scopeId,
            kind: cols.kind,
            geometry: cols.geometry,
            style: cols.style,
            createdAt: now,
            updatedAt: now,
          };
        }),
      );
    }
    return c.json({ ok: true });
  });
