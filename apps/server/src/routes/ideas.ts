import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  CreateIdeaSchema,
  ForbiddenError,
  IdeasQuerySchema,
  NotFoundError,
  UpdateIdeaSchema,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { exchanges, ideas, symbols, users } from '@tv/db/schema';

const ideaSelect = {
  id: ideas.id,
  title: ideas.title,
  body: ideas.body,
  direction: ideas.direction,
  visibility: ideas.visibility,
  snapshotUrl: ideas.snapshotUrl,
  likesCount: ideas.likesCount,
  commentsCount: ideas.commentsCount,
  createdAt: ideas.createdAt,
  updatedAt: ideas.updatedAt,
  author: {
    id: users.id,
    displayName: users.displayName,
    email: users.email,
  },
  symbol: {
    id: symbols.id,
    ticker: symbols.ticker,
    name: symbols.name,
    exchange: exchanges.code,
  },
};

type IdeaSelectRow = {
  readonly symbol: { id: string | null } & Record<string, unknown>;
} & Record<string, unknown>;

const normalizeRow = <T extends IdeaSelectRow>(row: T) => ({
  ...row,
  symbol: row.symbol.id ? row.symbol : null,
});

export const ideaRoutes = new Hono()
  .get('/ideas', zValidator('query', IdeasQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const filters: SQL[] = [
      eq(ideas.tenantId, tenant.tenantId),
      or(eq(ideas.visibility, 'public'), eq(ideas.userId, tenant.userId))!,
    ];

    if (q.visibility) filters.push(eq(ideas.visibility, q.visibility));
    if (q.direction) filters.push(eq(ideas.direction, q.direction));
    if (q.author) filters.push(eq(ideas.userId, q.author === 'me' ? tenant.userId : q.author));
    if (q.symbol) {
      const like = `%${q.symbol}%`;
      filters.push(
        or(eq(symbols.id, q.symbol), ilike(symbols.ticker, like), ilike(symbols.name, like))!,
      );
    }

    const rows = await db
      .select(ideaSelect)
      .from(ideas)
      .innerJoin(users, eq(users.id, ideas.userId))
      .leftJoin(symbols, eq(symbols.id, ideas.symbolId))
      .leftJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(...filters))
      .orderBy(desc(ideas.createdAt))
      .limit(q.limit);

    return c.json({ ideas: rows.map(normalizeRow) });
  })
  .get('/ideas/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [row] = await db
      .select(ideaSelect)
      .from(ideas)
      .innerJoin(users, eq(users.id, ideas.userId))
      .leftJoin(symbols, eq(symbols.id, ideas.symbolId))
      .leftJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Idea not found');
    if (row.visibility !== 'public' && row.author.id !== tenant.userId) {
      throw new NotFoundError('Idea not found');
    }
    return c.json({ idea: normalizeRow(row) });
  })
  .post('/ideas', zValidator('json', CreateIdeaSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');

    let symbolId: string | undefined;
    if (body.symbol) {
      const [sym] = await db
        .select({ id: symbols.id })
        .from(symbols)
        .where(or(eq(symbols.id, body.symbol), ilike(symbols.ticker, body.symbol)))
        .limit(1);
      if (!sym) throw new ValidationError('Symbol not found');
      symbolId = sym.id;
    }

    const id = ulid();
    const values: typeof ideas.$inferInsert = {
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      title: body.title,
      visibility: body.visibility,
    };
    if (symbolId !== undefined) values.symbolId = symbolId;
    if (body.body !== undefined) values.body = body.body;
    if (body.direction !== undefined) values.direction = body.direction;
    if (body.snapshotUrl !== undefined) values.snapshotUrl = body.snapshotUrl;

    await db.insert(ideas).values(values);
    return c.json({ id });
  })
  .patch('/ideas/:id', zValidator('json', UpdateIdeaSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db
      .select({ userId: ideas.userId })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Idea not found');
    if (existing.userId !== tenant.userId) throw new ForbiddenError('Not your idea');

    const updates: Partial<typeof ideas.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.direction !== undefined) updates.direction = body.direction;
    if (body.visibility !== undefined) updates.visibility = body.visibility;
    if (body.snapshotUrl !== undefined) updates.snapshotUrl = body.snapshotUrl;

    await db
      .update(ideas)
      .set(updates)
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  .delete('/ideas/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    const [existing] = await db
      .select({ userId: ideas.userId })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Idea not found');
    if (existing.userId !== tenant.userId) throw new ForbiddenError('Not your idea');

    await db.delete(ideas).where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  });
