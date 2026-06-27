import { describe, expect, test } from 'bun:test';
import { RateLimitError } from '@tv/core';
import { checkWsApiKeyRateLimit, readWsApiKey } from './ws-auth.js';
import type { RedisClient } from '../middleware/tenant.js';

class FakeRedis {
  readonly counts = new Map<string, number>();
  readonly expirations = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.expirations.set(key, seconds);
    return true;
  }
}

const request = (headers: Record<string, string> = {}): Request =>
  new Request('http://localhost/v1/ws', { headers });

describe('readWsApiKey', () => {
  test('reads browser-compatible query string keys first', () => {
    const req = request({ authorization: 'Bearer tvk_header_secret' });
    const url = new URL('http://localhost/v1/ws?api_key=tvk_query_secret');

    expect(readWsApiKey(req, url)).toBe('tvk_query_secret');
  });

  test('falls back to bearer and x-api-key headers', () => {
    expect(
      readWsApiKey(
        request({ authorization: 'Bearer tvk_bearer_secret' }),
        new URL('http://localhost/v1/ws'),
      ),
    ).toBe('tvk_bearer_secret');

    expect(
      readWsApiKey(
        request({ 'x-api-key': 'tvk_header_secret' }),
        new URL('http://localhost/v1/ws'),
      ),
    ).toBe('tvk_header_secret');
  });
});

describe('checkWsApiKeyRateLimit', () => {
  test('allows upgrades through the configured limit', async () => {
    const redis = new FakeRedis();
    const opts = { limit: 2, windowSec: 60 };
    const now = 1_700_000_040_000;

    await checkWsApiKeyRateLimit(redis as never as RedisClient, 'abc123', opts, now);
    await checkWsApiKeyRateLimit(redis as never as RedisClient, 'abc123', opts, now + 1_000);

    expect(redis.expirations.get('rl:v1:ws:abc123:28333334')).toBe(60);
  });

  test('rejects upgrades over the configured limit', async () => {
    const redis = new FakeRedis();
    const opts = { limit: 1, windowSec: 60 };
    const now = 1_700_000_040_000;

    await checkWsApiKeyRateLimit(redis as never as RedisClient, 'abc123', opts, now);

    await expect(
      checkWsApiKeyRateLimit(redis as never as RedisClient, 'abc123', opts, now + 1_000),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
