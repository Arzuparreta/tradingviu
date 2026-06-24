import { Hono } from 'hono';
import { and, desc, eq, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  NotFoundError,
  ValidationError,
  tryGetTenant,
  type TenantContext,
} from '@tv/core';
import { follows, ideas, tenantMembers, users } from '@tv/db/schema';
import type { Database } from '@tv/db';

const publicIdeasCount = (tenantId: string): SQL<number> =>
  sql<number>`(
    SELECT COUNT(*)::int FROM ${ideas}
    WHERE ${ideas.userId} = ${users.id}
      AND ${ideas.tenantId} = ${tenantId}
      AND ${ideas.visibility} = 'public'
  )`;

const personSelect = (tenantId: string) => ({
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  ideasCount: publicIdeasCount(tenantId),
});

const isTenantMember = async (
  db: Database,
  tenant: TenantContext,
  userId: string,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: tenantMembers.userId })
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.tenantId, tenant.tenantId), eq(tenantMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
};

export const followRoutes = new Hono()
  // Authors the caller follows.
  .get('/follows/following', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select({ ...personSelect(tenant.tenantId), followedAt: follows.createdAt })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followedId))
      .where(eq(follows.followerId, tenant.userId))
      .orderBy(desc(follows.createdAt))
      .limit(200);
    return c.json({ users: rows });
  })
  // Members who follow the caller.
  .get('/follows/followers', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select({ ...personSelect(tenant.tenantId), followedAt: follows.createdAt })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followerId))
      .where(eq(follows.followedId, tenant.userId))
      .orderBy(desc(follows.createdAt))
      .limit(200);
    return c.json({ users: rows });
  })
  // Tenant members the caller does not follow yet (self excluded).
  .get('/follows/suggestions', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const followed = db
      .select({ id: follows.followedId })
      .from(follows)
      .where(eq(follows.followerId, tenant.userId));
    const rows = await db
      .select(personSelect(tenant.tenantId))
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(
        and(
          eq(tenantMembers.tenantId, tenant.tenantId),
          ne(users.id, tenant.userId),
          notInArray(users.id, followed),
        ),
      )
      .orderBy(desc(publicIdeasCount(tenant.tenantId)))
      .limit(20);
    return c.json({ users: rows });
  })
  // Follow a member (idempotent).
  .post('/follows/:userId', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const targetId = c.req.param('userId');
    if (targetId === tenant.userId) throw new ValidationError('Cannot follow yourself');
    if (!(await isTenantMember(db, tenant, targetId))) throw new NotFoundError('User not found');

    const [existing] = await db
      .select({ id: follows.id })
      .from(follows)
      .where(and(eq(follows.followerId, tenant.userId), eq(follows.followedId, targetId)))
      .limit(1);
    if (!existing) {
      await db.insert(follows).values({
        id: ulid(),
        tenantId: tenant.tenantId,
        followerId: tenant.userId,
        followedId: targetId,
      });
    }
    return c.json({ following: true });
  })
  // Unfollow (idempotent).
  .delete('/follows/:userId', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, tenant.userId),
          eq(follows.followedId, c.req.param('userId')),
        ),
      );
    return c.json({ following: false });
  });
