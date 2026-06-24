import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  CreateSpacePostSchema,
  CreateSpaceSchema,
  ForbiddenError,
  NotFoundError,
  SpacesQuerySchema,
  UpdateSpaceSchema,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { spacePosts, spaceSubscriptions, spaces, users } from '@tv/db/schema';
import type { Database } from '@tv/db';

const subscribedJoin = (userId: string): SQL =>
  and(
    eq(spaceSubscriptions.spaceId, spaces.id),
    eq(spaceSubscriptions.userId, userId),
    eq(spaceSubscriptions.status, 'active'),
  ) as SQL;

const spaceMeta = {
  id: spaces.id,
  name: spaces.name,
  description: spaces.description,
  visibility: spaces.visibility,
  priceCents: spaces.priceCents,
  currency: spaces.currency,
  subscribersCount: spaces.subscribersCount,
  subscribed: sql<boolean>`${spaceSubscriptions.id} IS NOT NULL`,
  createdAt: spaces.createdAt,
  updatedAt: spaces.updatedAt,
  owner: {
    id: users.id,
    displayName: users.displayName,
    email: users.email,
  },
};

interface SpaceRow {
  readonly id: string;
  readonly ownerId: string;
  readonly visibility: string;
  readonly priceCents: number;
}

const findSpace = async (
  db: Database,
  tenant: TenantContext,
  id: string,
): Promise<SpaceRow | undefined> => {
  const [row] = await db
    .select({
      id: spaces.id,
      ownerId: spaces.ownerId,
      visibility: spaces.visibility,
      priceCents: spaces.priceCents,
    })
    .from(spaces)
    .where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)))
    .limit(1);
  return row;
};

const activeSubscription = async (
  db: Database,
  tenant: TenantContext,
  spaceId: string,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: spaceSubscriptions.id })
    .from(spaceSubscriptions)
    .where(
      and(
        eq(spaceSubscriptions.spaceId, spaceId),
        eq(spaceSubscriptions.userId, tenant.userId),
        eq(spaceSubscriptions.status, 'active'),
      ),
    )
    .limit(1);
  return Boolean(row);
};

// Owner or active subscriber can read a space's posts.
const isEntitled = async (
  db: Database,
  tenant: TenantContext,
  space: SpaceRow,
): Promise<boolean> =>
  space.ownerId === tenant.userId || (await activeSubscription(db, tenant, space.id));

export const spaceRoutes = new Hono()
  .get('/spaces', zValidator('query', SpacesQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const filters: SQL[] = [
      eq(spaces.tenantId, tenant.tenantId),
      // public spaces, your own, or ones you actively subscribe to
      or(
        eq(spaces.visibility, 'public'),
        eq(spaces.ownerId, tenant.userId),
        sql`${spaceSubscriptions.id} IS NOT NULL`,
      )!,
    ];

    if (q.free === true) filters.push(eq(spaces.priceCents, 0));
    if (q.subscribed === true) filters.push(sql`${spaceSubscriptions.id} IS NOT NULL`);
    if (q.owner) {
      filters.push(eq(spaces.ownerId, q.owner === 'me' ? tenant.userId : q.owner));
    }
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(spaces.name, like), ilike(spaces.description, like))!);
    }

    const rows = await db
      .select(spaceMeta)
      .from(spaces)
      .innerJoin(users, eq(users.id, spaces.ownerId))
      .leftJoin(spaceSubscriptions, subscribedJoin(tenant.userId))
      .where(and(...filters))
      .orderBy(
        q.sort === 'popular' ? desc(spaces.subscribersCount) : desc(spaces.createdAt),
      )
      .limit(q.limit);

    return c.json({ spaces: rows });
  })
  .get('/spaces/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [row] = await db
      .select(spaceMeta)
      .from(spaces)
      .innerJoin(users, eq(users.id, spaces.ownerId))
      .leftJoin(spaceSubscriptions, subscribedJoin(tenant.userId))
      .where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Space not found');
    // Private spaces are only visible to the owner and active subscribers.
    if (row.visibility !== 'public' && row.owner.id !== tenant.userId && !row.subscribed) {
      throw new NotFoundError('Space not found');
    }
    return c.json({ space: { ...row, isOwner: row.owner.id === tenant.userId } });
  })
  .post('/spaces', zValidator('json', CreateSpaceSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');

    const id = ulid();
    const values: typeof spaces.$inferInsert = {
      id,
      tenantId: tenant.tenantId,
      ownerId: tenant.userId,
      name: body.name,
      visibility: body.visibility,
      priceCents: body.priceCents,
      currency: body.currency,
    };
    if (body.description !== undefined) values.description = body.description;

    await db.insert(spaces).values(values);
    return c.json({ id });
  })
  .patch('/spaces/:id', zValidator('json', UpdateSpaceSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (space.ownerId !== tenant.userId) throw new ForbiddenError('Not your space');

    const updates: Partial<typeof spaces.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.visibility !== undefined) updates.visibility = body.visibility;
    if (body.priceCents !== undefined) updates.priceCents = body.priceCents;

    await db
      .update(spaces)
      .set(updates)
      .where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  .delete('/spaces/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (space.ownerId !== tenant.userId) throw new ForbiddenError('Not your space');

    await db.delete(spaces).where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  // Subscribe (grant entitlement). For paid spaces this represents a completed
  // purchase; wiring Stripe checkout in front of it is a follow-up — with billing
  // disabled the entitlement is granted directly.
  .post('/spaces/:id/subscribe', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (space.ownerId === tenant.userId) {
      throw new ValidationError('You own this space');
    }

    const [existing] = await db
      .select({ id: spaceSubscriptions.id, status: spaceSubscriptions.status })
      .from(spaceSubscriptions)
      .where(
        and(eq(spaceSubscriptions.spaceId, id), eq(spaceSubscriptions.userId, tenant.userId)),
      )
      .limit(1);

    if (!existing) {
      await db.insert(spaceSubscriptions).values({
        id: ulid(),
        tenantId: tenant.tenantId,
        spaceId: id,
        userId: tenant.userId,
        status: 'active',
        priceCents: space.priceCents,
        startedAt: new Date(),
      });
    } else if (existing.status !== 'active') {
      await db
        .update(spaceSubscriptions)
        .set({
          status: 'active',
          priceCents: space.priceCents,
          startedAt: new Date(),
          canceledAt: null,
        })
        .where(eq(spaceSubscriptions.id, existing.id));
    }

    // Bump the denormalized counter only when transitioning into active.
    if (!existing || existing.status !== 'active') {
      await db
        .update(spaces)
        .set({ subscribersCount: sql`${spaces.subscribersCount} + 1` })
        .where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)));
    }

    return c.json({ subscribed: true });
  })
  .delete('/spaces/:id/subscribe', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');

    const updated = await db
      .update(spaceSubscriptions)
      .set({ status: 'canceled', canceledAt: new Date() })
      .where(
        and(
          eq(spaceSubscriptions.spaceId, id),
          eq(spaceSubscriptions.userId, tenant.userId),
          eq(spaceSubscriptions.status, 'active'),
        ),
      )
      .returning({ id: spaceSubscriptions.id });

    if (updated.length > 0) {
      await db
        .update(spaces)
        .set({ subscribersCount: sql`GREATEST(${spaces.subscribersCount} - 1, 0)` })
        .where(and(eq(spaces.id, id), eq(spaces.tenantId, tenant.tenantId)));
    }

    return c.json({ subscribed: false });
  })
  // Gated content: only the owner or an active subscriber may read posts.
  .get('/spaces/:id/posts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (!(await isEntitled(db, tenant, space))) {
      throw new ForbiddenError('Subscribe to read this space');
    }

    const rows = await db
      .select({
        id: spacePosts.id,
        title: spacePosts.title,
        body: spacePosts.body,
        createdAt: spacePosts.createdAt,
        author: {
          id: users.id,
          displayName: users.displayName,
          email: users.email,
        },
      })
      .from(spacePosts)
      .innerJoin(users, eq(users.id, spacePosts.userId))
      .where(and(eq(spacePosts.spaceId, id), eq(spacePosts.tenantId, tenant.tenantId)))
      .orderBy(desc(spacePosts.createdAt))
      .limit(200);

    return c.json({ posts: rows });
  })
  .post('/spaces/:id/posts', zValidator('json', CreateSpacePostSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (space.ownerId !== tenant.userId) throw new ForbiddenError('Only the owner can post');

    const postId = ulid();
    const values: typeof spacePosts.$inferInsert = {
      id: postId,
      tenantId: tenant.tenantId,
      spaceId: id,
      userId: tenant.userId,
      body: body.body,
    };
    if (body.title !== undefined) values.title = body.title;

    await db.insert(spacePosts).values(values);
    return c.json({ id: postId });
  })
  .delete('/spaces/:id/posts/:postId', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const postId = c.req.param('postId');
    const space = await findSpace(db, tenant, id);
    if (!space) throw new NotFoundError('Space not found');
    if (space.ownerId !== tenant.userId) throw new ForbiddenError('Only the owner can delete');

    await db
      .delete(spacePosts)
      .where(
        and(
          eq(spacePosts.id, postId),
          eq(spacePosts.spaceId, id),
          eq(spacePosts.tenantId, tenant.tenantId),
        ),
      );
    return c.json({ ok: true });
  });
