import type { MiddlewareHandler } from 'hono';
import type { RedisClient } from '../middleware/tenant.js';

/** Redis key for the fixed window containing `now` (ms), per identity. */
export const rateWindowKey = (identity: string, now: number, windowSec: number): string =>
  `rl:v1:${identity}:${Math.floor(now / 1000 / windowSec)}`;

export interface RateDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Epoch ms when the current window resets. */
  readonly resetAt: number;
}

/**
 * Fixed-window decision given the post-increment `count`. Pure: a function of
 * the count, limit, window, and clock only.
 */
export const evaluateRateLimit = (
  count: number,
  limit: number,
  now: number,
  windowSec: number,
): RateDecision => {
  const windowStart = Math.floor(now / 1000 / windowSec) * windowSec;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: (windowStart + windowSec) * 1000,
  };
};

/**
 * Per-token fixed-window rate limiter for the public API. Counts requests in
 * Redis (`INCR` + `EXPIRE`), sets `X-RateLimit-*` headers, and returns 429 once
 * the limit is exceeded. **Fails open**: if Redis is unavailable the request is
 * allowed, so a limiter outage never takes the API down.
 */
export const rateLimit = (
  redis: RedisClient,
  opts: { limit: number; windowSec: number },
): MiddlewareHandler => {
  return async (c, next) => {
    const identity = (c.get('apiTokenPrefix') as string | undefined) ?? 'anon';
    const now = Date.now();
    const key = rateWindowKey(identity, now, opts.windowSec);

    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, opts.windowSec);
    } catch {
      return next(); // fail open
    }

    const d = evaluateRateLimit(count, opts.limit, now, opts.windowSec);
    c.header('X-RateLimit-Limit', String(opts.limit));
    c.header('X-RateLimit-Remaining', String(d.remaining));
    c.header('X-RateLimit-Reset', String(Math.floor(d.resetAt / 1000)));
    if (!d.allowed) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((d.resetAt - now) / 1000))));
      return c.json({ error: 'rate_limited' }, 429);
    }
    await next();
  };
};
