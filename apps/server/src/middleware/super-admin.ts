import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { withSuperAdminRls, clearRls } from '@tv/db';
import { users, tenants } from '@tv/db/schema';
import { verifyAccessToken, type TokenClaims } from '@tv/auth';
import { AuthError, type TenantContext as CoreTenantContext, runWithTenant, loadEnv } from '@tv/core';

export type RedisClient = Awaited<ReturnType<typeof import('redis').createClient>>;

export const superAdminContext = (deps: { db: Database; redis: RedisClient }): MiddlewareHandler => {
  return async (c, next) => {
    const token =
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      getCookie(c, 'tv_session') ??
      (c.req.query('token') ?? '');

    if (!token) throw new AuthError('Missing session token');

    const env = loadEnv();
    const claims = await verifyAccessToken(token, env.JWT_SECRET);

    if (!claims.sa) {
      throw new AuthError('Super admin required');
    }

    const { user, tenant } = await deps.db.transaction(async (txDb) => {
      await withSuperAdminRls(txDb as never, claims.sub);
      const [u] = await txDb.select().from(users).where(eq(users.id, claims.sub)).limit(1);
      if (!u) throw new AuthError('User not found');
      if (u.globalRole !== 'super_admin') throw new AuthError('Super admin required');
      const [t] = await txDb.select().from(tenants).where(eq(tenants.id, claims.tid)).limit(1);
      if (!t) throw new AuthError('Tenant not found');
      return { user: u, tenant: t };
    });

    const ctx: CoreTenantContext = {
      tenantId: tenant.id as CoreTenantContext['tenantId'],
      userId: claims.sub,
      tenantRole: claims.role,
      planCode: tenant.planCode,
      isSuperAdmin: true,
    };

    c.set('db', deps.db);
    c.set('redis', deps.redis);
    c.set('claims', claims);

    await runWithTenant(ctx, async () => {
      await deps.db.transaction(async (txDb) => {
        await withSuperAdminRls(txDb as never, ctx.userId);
        c.set('db', txDb as never);
        await next();
        await clearRls(txDb as never);
      });
    });
  };
};
