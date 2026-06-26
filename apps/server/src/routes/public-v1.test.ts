import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { runWithTenant, type TenantContext } from '@tv/core';
import { publicV1Routes } from './public-v1.js';

// ── Fake DB (mirrors the drawings test pattern) ──────────────────────────────

interface FakeNewsArticle {
  id: string;
  source: string;
  url: string;
  title: string;
  body: string;
  symbols: string[];
  sentiment: string | null;
  publishedAt: Date;
  fetchedAt: Date;
}

class FakeDb {
  _newsResults: FakeNewsArticle[] = [];
  _screenerResults: Array<Record<string, unknown>> = [];

  select() {
    const db = this;
    return {
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => db._screenerResults,
              }),
            }),
          }),
          where: () => ({
            orderBy: () => ({
              limit: async () => db._screenerResults,
            }),
          }),
        }),
        where: () => ({
          orderBy: () => ({
            limit: async () => db._newsResults,
          }),
        }),
      }),
    };
  }
}

const tenant: TenantContext = {
  tenantId: 'tenant_1' as TenantContext['tenantId'],
  userId: 'user_1' as TenantContext['userId'],
  tenantRole: 'admin',
  planCode: 'free',
  isSuperAdmin: false,
};

const appFor = (db: FakeDb, scopes: string[] = ['read']): Hono => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db', db as never);
    c.set('apiTokenPrefix' as never, 'test_prefix');
    c.set('apiScopes' as never, scopes);
    await runWithTenant(tenant, next);
  });
  app.route('/v1', publicV1Routes);
  return app;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('v1 public API', () => {
  // ── Indicators ────────────────────────────────────────────────────────────

  describe('GET /v1/indicators', () => {
    test('returns the full indicator catalog', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/indicators');
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        indicators: Array<{
          id: string;
          name: string;
          category: string;
          overlay: boolean;
          defaults: Record<string, number>;
          minBars: number;
        }>;
      };
      expect(body.indicators).toBeArray();
      expect(body.indicators.length).toBeGreaterThan(30);

      const sma = body.indicators.find((i) => i.id === 'sma');
      expect(sma).toBeDefined();
      if (sma) {
        expect(sma.name).toBe('SMA');
        expect(sma.category).toBe('overlap');
        expect(sma.overlay).toBe(true);
        expect(sma.defaults).toHaveProperty('length', 20);
        expect(sma.minBars).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /v1/indicators (scope check)', () => {
    test('rejects tokens without the read scope', async () => {
      const app = appFor(new FakeDb(), []);
      const res = await app.request('/v1/indicators');
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('insufficient_scope');
    });
  });

  // ── Indicators compute ─────────────────────────────────────────────────────

  describe('POST /v1/indicators/compute', () => {
    test('rejects compute with unknown indicator', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/indicators/compute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'nonexistent_zzz',
          symbol: 'sym_btc',
          interval: '1h',
          params: { length: 14 },
        }),
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('unknown_indicator');
    });
  });

  // ── Screener metrics ───────────────────────────────────────────────────────

  describe('GET /v1/screener/metrics', () => {
    test('returns the metric catalog', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/screener/metrics');
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        metrics: Array<{ key: string; group: string; format: string }>;
      };
      expect(body.metrics).toBeArray();
      expect(body.metrics.length).toBeGreaterThan(60);

      const roe = body.metrics.find((m) => m.key === 'roe');
      expect(roe).toBeDefined();
      if (roe) {
        expect(roe.group).toBe('Profitability');
        expect(roe.format).toBe('percent');
      }
    });
  });

  // ── News ──────────────────────────────────────────────────────────────────

  describe('GET /v1/news', () => {
    test('returns an empty article list when the db has none', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/news');
      expect(res.status).toBe(200);

      const body = (await res.json()) as { articles: unknown[] };
      expect(body.articles).toBeArray();
      expect(body.articles.length).toBe(0);
    });

    test('validates the limit parameter', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/news?limit=999');
      expect(res.status).toBe(400);
    });
  });

  // ── Screener ──────────────────────────────────────────────────────────────

  describe('POST /v1/screener', () => {
    test('returns an empty results array when db has no matches', async () => {
      const db = new FakeDb();
      const app = appFor(db);
      const res = await app.request('/v1/screener', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetClass: 'crypto',
          limit: 10,
        }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { results: unknown[] };
      expect(body.results).toBeArray();
    });
  });

  // ── Symbols (existing endpoints) ───────────────────────────────────────────

  describe('GET /v1/symbols', () => {
    test('validates limit range', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/symbols?limit=9999');
      expect(res.status).toBe(400);
    });

    test('accepts valid query', async () => {
      const app = appFor(new FakeDb());
      const res = await app.request('/v1/symbols?q=btc&limit=10');
      expect(res.status).toBe(200);
    });
  });
});
