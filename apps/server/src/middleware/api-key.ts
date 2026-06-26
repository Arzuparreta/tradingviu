import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@tv/db';
import { withTenantRls, withSuperAdminRls, clearRls } from '@tv/db';
import { accessTokens, tenantMembers, tenants } from '@tv/db/schema';
import { parseApiKeyPrefix, verifyApiKey } from '@tv/auth';
import { AuthError, type TenantContext as CoreTenantContext, runWithTenant } from '@tv/core';
import type { RedisClient } from './tenant.js';

/**
 * Authenticate a public-API request with a personal access token
 * (`Authorization: Bearer tvk_…` or `X-API-Key`). Mirrors `tenantContext`:
 * resolve the token + tenant under a short super_admin transaction (RLS can't
 * help before we know the tenant), then run the handler inside a tenant-scoped
 * RLS transaction. Tokens never carry super-admin.
 */
export const apiKeyContext = (deps: { db: Database; redis: RedisClient }): MiddlewareHandler => {
  return async (c, next) => {
    const presented =
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      c.req.header('x-api-key') ??
      '';
    if (!presented) throw new AuthError('Missing API key');
    const prefix = parseApiKeyPrefix(presented);
    if (!prefix) throw new AuthError('Malformed API key');

    const { ctx } = await deps.db.transaction(async (txDb) => {
      await withSuperAdminRls(txDb as never, 'system');
      const [token] = await txDb
        .select()
        .from(accessTokens)
        .where(eq(accessTokens.prefix, prefix))
        .limit(1);
      if (!token || !verifyApiKey(presented, token.hash)) throw new AuthError('Invalid API key');
      if (token.revokedAt) throw new AuthError('API key revoked');
      if (token.expiresAt && token.expiresAt.getTime() < Date.now())
        throw new AuthError('API key expired');

      const [tenant] = await txDb.select().from(tenants).where(eq(tenants.id, token.tenantId)).limit(1);
      if (!tenant) throw new AuthError('Tenant not found');
      if (tenant.status !== 'active') throw new AuthError('Tenant suspended');

      const [member] = await txDb
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.userId, token.userId), eq(tenantMembers.tenantId, token.tenantId)))
        .limit(1);

      await txDb
        .update(accessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(accessTokens.id, token.id));

      const resolved: CoreTenantContext = {
        tenantId: tenant.id as CoreTenantContext['tenantId'],
        userId: token.userId,
        tenantRole: member?.role ?? 'viewer',
        planCode: tenant.planCode,
        isSuperAdmin: false,
      };
      return { ctx: resolved };
    });

    c.set('db', deps.db);
    c.set('redis', deps.redis);

    await runWithTenant(ctx, async () => {
      await deps.db.transaction(async (txDb) => {
        await withTenantRls(txDb as never, ctx);
        c.set('db', txDb as never);
        await next();
        await clearRls(txDb as never);
      });
    });
  };
};
