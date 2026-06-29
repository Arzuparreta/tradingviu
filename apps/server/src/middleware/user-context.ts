import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Database } from '@tv/db';
import { verifyAccessToken, type TokenClaims } from '@tv/auth';
import {
  AuthError,
  type UserContext as CoreUserContext,
  runWithUserContext,
  loadEnv,
} from '@tv/core';

export type RedisClient = Awaited<ReturnType<typeof import('redis').createClient>>;

export interface UserContextVars {
  db: Database;
  redis: RedisClient;
  claims: TokenClaims;
}

/**
 * Single-user auth: verify the JWT and run the request with the owner's user id
 * in context. No tenant resolution, no RLS, no transaction wrapping.
 */
export const userContext = (deps: { db: Database; redis: RedisClient }): MiddlewareHandler => {
  return async (c, next) => {
    const token =
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      getCookie(c, 'tv_session') ??
      c.req.query('token') ??
      '';

    if (!token) throw new AuthError('Missing session token');

    const env = loadEnv();
    const claims = await verifyAccessToken(token, env.JWT_SECRET);

    c.set('db', deps.db);
    c.set('redis', deps.redis);
    c.set('claims', claims);

    const ctx: CoreUserContext = { userId: claims.sub };
    await runWithUserContext(ctx, async () => {
      await next();
    });
  };
};
