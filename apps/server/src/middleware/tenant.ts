import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { withTenantRls, withSuperAdminRls, clearRls } from '@tv/db';
import { users, tenantMembers, tenants } from '@tv/db/schema';
import { verifyAccessToken, type TokenClaims } from '@tv/auth';
import {
  AuthError,
  type TenantContext as CoreTenantContext,
  runWithTenant,
  loadEnv,
} from '@tv/core';

export type RedisClient = Awaited<ReturnType<typeof import('redis').createClient>>;

export interface TenantVars {
  db: Database;
  redis: RedisClient;
  claims: TokenClaims;
}

export const tenantContext = (deps: { db: Database; redis: RedisClient }): MiddlewareHandler => {
  return async (c, next) => {
    const token =
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      getCookie(c, 'tv_session') ??
      c.req.query('token') ??
      '';

    if (!token) throw new AuthError('Missing session token');

    const env = loadEnv();
    const claims = await verifyAccessToken(token, env.JWT_SECRET);

    // Phase 1: resolve tenant + membership using a short super_admin transaction
    // because we don't know the tenant yet, and the app connection has RLS.
    // Must be a transaction so set_config and the SELECTs run on the same
    // postgres connection (postgres.js uses a pool).
    const { tenant, member } = await deps.db.transaction(async (txDb) => {
      await withSuperAdminRls(txDb as never, claims.sub);
      const [t] = await txDb.select().from(tenants).where(eq(tenants.id, claims.tid)).limit(1);
      if (!t) throw new AuthError('Tenant not found');
      if (t.status !== 'active') throw new AuthError('Tenant suspended');
      const [m] = await txDb
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.userId, claims.sub), eq(tenantMembers.tenantId, claims.tid)))
        .limit(1);
      if (!m) throw new AuthError('Tenant membership missing');
      return { tenant: t, member: m };
    });

    const ctx: CoreTenantContext = {
      tenantId: tenant.id as CoreTenantContext['tenantId'],
      userId: claims.sub,
      tenantRole: claims.role,
      planCode: tenant.planCode,
      isSuperAdmin: claims.sa,
    };

    c.set('db', deps.db);
    c.set('redis', deps.redis);
    c.set('claims', claims);

    // Phase 2: run the request in a transaction with the resolved RLS context.
    await runWithTenant(ctx, async () => {
      await deps.db.transaction(async (txDb) => {
        if (ctx.isSuperAdmin) {
          await withSuperAdminRls(txDb as never, ctx.userId);
        } else {
          await withTenantRls(txDb as never, ctx);
        }
        // Override the context db with the transactional one so route handlers
        // share this connection.
        c.set('db', txDb as never);
        await next();
        await clearRls(txDb as never);
      });
    });
  };
};

export const requireRole = (allowed: ReadonlyArray<'owner' | 'admin' | 'member' | 'viewer'>) => {
  return async (c: Context, next: () => Promise<void>) => {
    const claims = c.get('claims') as TokenClaims;
    if (!allowed.includes(claims.role)) {
      throw new AuthError('Insufficient role');
    }
    await next();
  };
};
