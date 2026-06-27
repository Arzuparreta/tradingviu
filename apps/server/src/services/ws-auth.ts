import { and, eq } from 'drizzle-orm';
import { parseApiKeyPrefix, verifyAccessToken, verifyApiKey } from '@tv/auth';
import type { Database } from '@tv/db';
import { clearRls, withSuperAdminRls } from '@tv/db';
import { accessTokens, tenantMembers, tenants } from '@tv/db/schema';
import { AuthError, ForbiddenError, RateLimitError } from '@tv/core';
import type { RedisClient } from '../middleware/tenant.js';
import { evaluateRateLimit, rateWindowKey } from './rate-limit.js';

export interface AuthenticatedWsData {
  userId: string;
  tenantId: string;
  auth: 'session' | 'apiKey';
  apiTokenPrefix?: string;
}

export const readWsApiKey = (req: Request, url: URL): string => {
  return (
    url.searchParams.get('api_key') ??
    url.searchParams.get('access_token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-api-key') ??
    ''
  );
};

export const checkWsApiKeyRateLimit = async (
  redis: RedisClient,
  prefix: string,
  opts: { limit: number; windowSec: number },
  now = Date.now(),
): Promise<void> => {
  const key = rateWindowKey(`ws:${prefix}`, now, opts.windowSec);
  let count: number;
  try {
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, opts.windowSec);
  } catch {
    return; // fail open, same policy as REST public rate limiting
  }

  const decision = evaluateRateLimit(count, opts.limit, now, opts.windowSec);
  if (!decision.allowed) {
    throw new RateLimitError('WebSocket upgrade rate limited', {
      retryAfterSec: Math.max(1, Math.ceil((decision.resetAt - now) / 1000)),
    });
  }
};

export const authenticateWsToken = async (
  db: Database,
  token: string,
  jwtSecret: string,
): Promise<AuthenticatedWsData> => {
  if (!token) throw new AuthError('Missing session token');
  const claims = await verifyAccessToken(token, jwtSecret);
  await db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, claims.sub);
    try {
      const [tenant] = await txDb.select().from(tenants).where(eq(tenants.id, claims.tid)).limit(1);
      if (!tenant) throw new AuthError('Tenant not found');
      if (tenant.status !== 'active') throw new AuthError('Tenant suspended');
      const [member] = await txDb
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.userId, claims.sub), eq(tenantMembers.tenantId, claims.tid)))
        .limit(1);
      if (!member) throw new AuthError('Tenant membership missing');
    } finally {
      await clearRls(txDb as never);
    }
  });
  return { userId: claims.sub, tenantId: claims.tid, auth: 'session' };
};

export const authenticateWsApiKey = async (
  db: Database,
  redis: RedisClient,
  apiKey: string,
  rateOpts: { limit: number; windowSec: number },
): Promise<AuthenticatedWsData> => {
  if (!apiKey) throw new AuthError('Missing API key');
  const prefix = parseApiKeyPrefix(apiKey);
  if (!prefix) throw new AuthError('Malformed API key');

  await checkWsApiKeyRateLimit(redis, prefix, rateOpts);

  return db.transaction(async (txDb) => {
    await withSuperAdminRls(txDb as never, 'system');
    try {
      const [token] = await txDb
        .select()
        .from(accessTokens)
        .where(eq(accessTokens.prefix, prefix))
        .limit(1);
      if (!token || !verifyApiKey(apiKey, token.hash)) throw new AuthError('Invalid API key');
      if (token.revokedAt) throw new AuthError('API key revoked');
      if (token.expiresAt && token.expiresAt.getTime() < Date.now())
        throw new AuthError('API key expired');
      if (!token.scopes.includes('read')) throw new ForbiddenError('Missing read scope');

      const [tenant] = await txDb
        .select()
        .from(tenants)
        .where(eq(tenants.id, token.tenantId))
        .limit(1);
      if (!tenant) throw new AuthError('Tenant not found');
      if (tenant.status !== 'active') throw new AuthError('Tenant suspended');
      const [member] = await txDb
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(
          and(eq(tenantMembers.userId, token.userId), eq(tenantMembers.tenantId, token.tenantId)),
        )
        .limit(1);
      if (!member) throw new AuthError('Tenant membership missing');

      await txDb
        .update(accessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(accessTokens.id, token.id));

      return {
        userId: token.userId,
        tenantId: token.tenantId,
        auth: 'apiKey',
        apiTokenPrefix: prefix,
      };
    } finally {
      await clearRls(txDb as never);
    }
  });
};
