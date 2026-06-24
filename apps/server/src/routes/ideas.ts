import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  CreateCommentSchema,
  CreateIdeaSchema,
  ForbiddenError,
  IdeasQuerySchema,
  NotFoundError,
  UpdateIdeaSchema,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { comments, exchanges, ideas, likes, symbols, users } from '@tv/db/schema';
import type { Database } from '@tv/db';

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
  liked: sql<boolean>`${likes.id} IS NOT NULL`,
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

const likedJoin = (userId: string): SQL =>
  and(
    eq(likes.targetId, ideas.id),
    eq(likes.targetType, 'idea'),
    eq(likes.userId, userId),
  ) as SQL;

interface VisibleIdea {
  readonly id: string;
  readonly userId: string;
  readonly visibility: string;
}

const findVisibleIdea = async (
  db: Database,
  tenant: TenantContext,
  id: string,
): Promise<VisibleIdea | undefined> => {
  const [row] = await db
    .select({ id: ideas.id, userId: ideas.userId, visibility: ideas.visibility })
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)))
    .limit(1);
  if (!row) return undefined;
  if (row.visibility !== 'public' && row.userId !== tenant.userId) return undefined;
  return row;
};

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
      .leftJoin(likes, likedJoin(tenant.userId))
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
      .leftJoin(likes, likedJoin(tenant.userId))
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
  })
  .get('/ideas/:id/comments', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    if (!(await findVisibleIdea(db, tenant, id))) throw new NotFoundError('Idea not found');

    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        author: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        },
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(
        and(
          eq(comments.tenantId, tenant.tenantId),
          eq(comments.targetType, 'idea'),
          eq(comments.targetId, id),
        ),
      )
      .orderBy(asc(comments.createdAt))
      .limit(500);

    return c.json({ comments: rows });
  })
  .post('/ideas/:id/comments', zValidator('json', CreateCommentSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    if (!(await findVisibleIdea(db, tenant, id))) throw new NotFoundError('Idea not found');

    const commentId = ulid();
    const values: typeof comments.$inferInsert = {
      id: commentId,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      targetType: 'idea',
      targetId: id,
      body: body.body,
    };
    if (body.parentId !== undefined) values.parentId = body.parentId;

    await db.insert(comments).values(values);
    await db
      .update(ideas)
      .set({ commentsCount: sql`${ideas.commentsCount} + 1` })
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));

    return c.json({ id: commentId });
  })
  .delete('/ideas/:id/comments/:commentId', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const commentId = c.req.param('commentId');

    const [existing] = await db
      .select({ userId: comments.userId })
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.tenantId, tenant.tenantId),
          eq(comments.targetType, 'idea'),
          eq(comments.targetId, id),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Comment not found');
    if (existing.userId !== tenant.userId) throw new ForbiddenError('Not your comment');

    await db.delete(comments).where(eq(comments.id, commentId));
    await db
      .update(ideas)
      .set({ commentsCount: sql`GREATEST(${ideas.commentsCount} - 1, 0)` })
      .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));

    return c.json({ ok: true });
  })
  .post('/ideas/:id/like', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    if (!(await findVisibleIdea(db, tenant, id))) throw new NotFoundError('Idea not found');

    const [existing] = await db
      .select({ id: likes.id })
      .from(likes)
      .where(
        and(
          eq(likes.userId, tenant.userId),
          eq(likes.targetType, 'idea'),
          eq(likes.targetId, id),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(likes).values({
        id: ulid(),
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        targetType: 'idea',
        targetId: id,
      });
      await db
        .update(ideas)
        .set({ likesCount: sql`${ideas.likesCount} + 1` })
        .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));
    }

    return c.json({ liked: true });
  })
  .delete('/ideas/:id/like', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    const deleted = await db
      .delete(likes)
      .where(
        and(
          eq(likes.userId, tenant.userId),
          eq(likes.targetType, 'idea'),
          eq(likes.targetId, id),
        ),
      )
      .returning({ id: likes.id });

    if (deleted.length > 0) {
      await db
        .update(ideas)
        .set({ likesCount: sql`GREATEST(${ideas.likesCount} - 1, 0)` })
        .where(and(eq(ideas.id, id), eq(ideas.tenantId, tenant.tenantId)));
    }

    return c.json({ liked: false });
  });
