import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  ForbiddenError,
  NotFoundError,
  PublishScriptSchema,
  ScriptsQuerySchema,
  UpdateScriptSchema,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { likes, publishedScripts, users } from '@tv/db/schema';
import type { Database } from '@tv/db';

const favoritesCount = sql<number>`(
  SELECT COUNT(*)::int FROM ${likes}
  WHERE ${likes.targetType} = 'script' AND ${likes.targetId} = ${publishedScripts.id}
)`;

// List/meta projection — never exposes source.
const scriptMeta = {
  id: publishedScripts.id,
  name: publishedScripts.name,
  description: publishedScripts.description,
  visibility: publishedScripts.visibility,
  license: publishedScripts.license,
  priceCents: publishedScripts.priceCents,
  downloads: publishedScripts.downloads,
  favoritesCount,
  favorited: sql<boolean>`${likes.id} IS NOT NULL`,
  createdAt: publishedScripts.createdAt,
  updatedAt: publishedScripts.updatedAt,
  author: {
    id: users.id,
    displayName: users.displayName,
    email: users.email,
  },
};

const favoritedJoin = (userId: string): SQL =>
  and(
    eq(likes.targetId, publishedScripts.id),
    eq(likes.targetType, 'script'),
    eq(likes.userId, userId),
  ) as SQL;

interface VisibleScript {
  readonly id: string;
  readonly userId: string;
  readonly visibility: string;
  readonly source: string;
}

const canReadSource = (script: VisibleScript, userId: string): boolean =>
  script.userId === userId || script.visibility === 'public';

const findVisibleScript = async (
  db: Database,
  tenant: TenantContext,
  id: string,
): Promise<VisibleScript | undefined> => {
  const [row] = await db
    .select({
      id: publishedScripts.id,
      userId: publishedScripts.userId,
      visibility: publishedScripts.visibility,
      source: publishedScripts.source,
    })
    .from(publishedScripts)
    .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)))
    .limit(1);
  if (!row) return undefined;
  // Private scripts are only visible to their author.
  if (row.visibility === 'private' && row.userId !== tenant.userId) return undefined;
  return row;
};

export const scriptRoutes = new Hono()
  .get('/scripts', zValidator('query', ScriptsQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const filters: SQL[] = [
      eq(publishedScripts.tenantId, tenant.tenantId),
      // public + protected are discoverable; private only to its author.
      or(
        eq(publishedScripts.visibility, 'public'),
        eq(publishedScripts.visibility, 'protected'),
        eq(publishedScripts.userId, tenant.userId),
      )!,
    ];

    if (q.visibility) filters.push(eq(publishedScripts.visibility, q.visibility));
    if (q.free === true) filters.push(eq(publishedScripts.priceCents, 0));
    if (q.author) {
      filters.push(
        eq(publishedScripts.userId, q.author === 'me' ? tenant.userId : q.author),
      );
    }
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(
        or(ilike(publishedScripts.name, like), ilike(publishedScripts.description, like))!,
      );
    }

    const rows = await db
      .select(scriptMeta)
      .from(publishedScripts)
      .innerJoin(users, eq(users.id, publishedScripts.userId))
      .leftJoin(likes, favoritedJoin(tenant.userId))
      .where(and(...filters))
      .orderBy(
        q.sort === 'popular' ? desc(publishedScripts.downloads) : desc(publishedScripts.createdAt),
      )
      .limit(q.limit);

    return c.json({ scripts: rows });
  })
  .get('/scripts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [row] = await db
      .select(scriptMeta)
      .from(publishedScripts)
      .innerJoin(users, eq(users.id, publishedScripts.userId))
      .leftJoin(likes, favoritedJoin(tenant.userId))
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Script not found');
    if (row.visibility === 'private' && row.author.id !== tenant.userId) {
      throw new NotFoundError('Script not found');
    }

    const visible = await findVisibleScript(db, tenant, id);
    const unlocked = visible ? canReadSource(visible, tenant.userId) : false;
    return c.json({
      script: { ...row, source: unlocked ? (visible?.source ?? null) : null, locked: !unlocked },
    });
  })
  .post('/scripts', zValidator('json', PublishScriptSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');

    const id = ulid();
    const values: typeof publishedScripts.$inferInsert = {
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      name: body.name,
      source: body.source,
      visibility: body.visibility,
      license: body.license,
      priceCents: body.priceCents,
    };
    if (body.description !== undefined) values.description = body.description;

    await db.insert(publishedScripts).values(values);
    return c.json({ id });
  })
  .patch('/scripts/:id', zValidator('json', UpdateScriptSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db
      .select({ userId: publishedScripts.userId })
      .from(publishedScripts)
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Script not found');
    if (existing.userId !== tenant.userId) throw new ForbiddenError('Not your script');

    const updates: Partial<typeof publishedScripts.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.source !== undefined) updates.source = body.source;
    if (body.visibility !== undefined) updates.visibility = body.visibility;
    if (body.license !== undefined) updates.license = body.license;
    if (body.priceCents !== undefined) updates.priceCents = body.priceCents;

    await db
      .update(publishedScripts)
      .set(updates)
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  .delete('/scripts/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    const [existing] = await db
      .select({ userId: publishedScripts.userId })
      .from(publishedScripts)
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Script not found');
    if (existing.userId !== tenant.userId) throw new ForbiddenError('Not your script');

    await db
      .delete(publishedScripts)
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  // Add to library: counts a download and returns source only when readable.
  .post('/scripts/:id/install', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const script = await findVisibleScript(db, tenant, id);
    if (!script) throw new NotFoundError('Script not found');

    const [updated] = await db
      .update(publishedScripts)
      .set({ downloads: sql`${publishedScripts.downloads} + 1` })
      .where(and(eq(publishedScripts.id, id), eq(publishedScripts.tenantId, tenant.tenantId)))
      .returning({ downloads: publishedScripts.downloads });

    const unlocked = canReadSource(script, tenant.userId);
    return c.json({
      downloads: updated?.downloads ?? 0,
      source: unlocked ? script.source : null,
      locked: !unlocked,
    });
  })
  .post('/scripts/:id/favorite', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    if (!(await findVisibleScript(db, tenant, id))) throw new NotFoundError('Script not found');

    const [existing] = await db
      .select({ id: likes.id })
      .from(likes)
      .where(
        and(
          eq(likes.userId, tenant.userId),
          eq(likes.targetType, 'script'),
          eq(likes.targetId, id),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(likes).values({
        id: ulid(),
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        targetType: 'script',
        targetId: id,
      });
    }
    return c.json({ favorited: true });
  })
  .delete('/scripts/:id/favorite', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await db
      .delete(likes)
      .where(
        and(
          eq(likes.userId, tenant.userId),
          eq(likes.targetType, 'script'),
          eq(likes.targetId, id),
        ),
      );
    return c.json({ favorited: false });
  });
