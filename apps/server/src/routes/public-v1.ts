import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  exchanges,
  fundamentalSnapshots,
  newsArticles,
  symbols,
  watchlistItems,
  watchlists,
} from '@tv/db/schema';
import { all, compute, find } from '@tv/ta-lib';
import {
  buildScreenerFilters,
  maybeWhere,
  readScreenerMetrics,
  screenerMetricCatalog,
  screenerOrderBy,
} from '@tv/screener-engine';
import {
  AddPublicWatchlistItemSchema,
  CreatePublicWatchlistSchema,
  NewsQuerySchema,
  NotFoundError,
  ScreenerQuerySchema,
  tryGetTenant,
  type TenantContext,
  UpdatePublicWatchlistItemSchema,
  ValidationError,
} from '@tv/core';
import { requireScope } from '../middleware/api-key.js';
import { getFreshBars } from '../services/market-data.js';

// ── Query schemas ────────────────────────────────────────────────────────────

const SymbolsQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

const HistoryQuery = z.object({
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(300),
});

const IndicatorComputeBody = z.object({
  id: z.string().min(1).max(80),
  symbol: z.string().min(1).max(80),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  params: z.record(z.number().finite()).optional(),
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

const newsSymbolFilter = (symbol: string): SQL =>
  sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(${newsArticles.symbols}) AS symbol_value(value)
    WHERE lower(symbol_value.value) = lower(${symbol})
  )`;

// ── Routes ───────────────────────────────────────────────────────────────────

/** Public, API-key-authenticated surface. Mounted under `/v1`. */
export const publicV1Routes = new Hono()
  .use('*', requireScope('read'))
  // ---- Symbols ----
  .get('/symbols', zValidator('query', SymbolsQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters = [eq(symbols.active, true)];
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(symbols.ticker, like), ilike(symbols.name, like))!);
    }
    const rows = await db
      .select({
        id: symbols.id,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        exchange: exchanges.code,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(...filters))
      .orderBy(asc(symbols.ticker))
      .limit(q.limit);
    return c.json({ symbols: rows });
  })
  .get('/symbols/:id/history', zValidator('query', HistoryQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const result = await getFreshBars(db, c.req.param('id'), q.interval, { limit: q.limit });
    return c.json({ symbol: result.symbol, interval: q.interval, bars: result.bars });
  })
  // ---- Watchlists ----
  .get('/watchlists', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select({
        id: watchlists.id,
        name: watchlists.name,
        createdAt: watchlists.createdAt,
        updatedAt: watchlists.updatedAt,
      })
      .from(watchlists)
      .where(and(eq(watchlists.tenantId, tenant.tenantId), eq(watchlists.userId, tenant.userId)))
      .orderBy(asc(watchlists.name));
    return c.json({ watchlists: rows });
  })
  .post(
    '/watchlists',
    requireScope('write'),
    zValidator('json', CreatePublicWatchlistSchema),
    async (c) => {
      const db = c.get('db');
      const tenant = tryGetTenant() as TenantContext;
      const body = c.req.valid('json');
      const id = ulid();
      await db.insert(watchlists).values({
        id,
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        name: body.name,
      });
      return c.json({ id }, 201);
    },
  )
  .delete('/watchlists/:id', requireScope('write'), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [list] = await db
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(
        and(
          eq(watchlists.id, id),
          eq(watchlists.tenantId, tenant.tenantId),
          eq(watchlists.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!list) throw new NotFoundError('Watchlist not found');
    await db.delete(watchlists).where(eq(watchlists.id, id));
    return c.json({ ok: true });
  })
  .get('/watchlists/:id/items', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const [list] = await db
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(
        and(
          eq(watchlists.id, id),
          eq(watchlists.tenantId, tenant.tenantId),
          eq(watchlists.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!list) throw new NotFoundError('Watchlist not found');

    const rows = await db
      .select({
        id: watchlistItems.id,
        symbolId: watchlistItems.symbolId,
        color: watchlistItems.color,
        note: watchlistItems.note,
        sortOrder: watchlistItems.sortOrder,
        symbol: {
          id: symbols.id,
          ticker: symbols.ticker,
          name: symbols.name,
          exchange: exchanges.code,
        },
      })
      .from(watchlistItems)
      .innerJoin(symbols, eq(symbols.id, watchlistItems.symbolId))
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(and(eq(watchlistItems.tenantId, tenant.tenantId), eq(watchlistItems.watchlistId, id)))
      .orderBy(asc(watchlistItems.sortOrder));
    return c.json({ items: rows });
  })
  .post(
    '/watchlists/:id/items',
    requireScope('write'),
    zValidator('json', AddPublicWatchlistItemSchema),
    async (c) => {
      const db = c.get('db');
      const tenant = tryGetTenant() as TenantContext;
      const id = c.req.param('id');
      const body = c.req.valid('json');

      const [list] = await db
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, id),
            eq(watchlists.tenantId, tenant.tenantId),
            eq(watchlists.userId, tenant.userId),
          ),
        )
        .limit(1);
      if (!list) throw new NotFoundError('Watchlist not found');

      const [sym] = await db
        .select({ id: symbols.id })
        .from(symbols)
        .where(eq(symbols.id, body.symbol))
        .limit(1);
      if (!sym) throw new ValidationError('Symbol not found');

      const existing = await db
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(
          and(eq(watchlistItems.tenantId, tenant.tenantId), eq(watchlistItems.watchlistId, id)),
        );
      if (existing.length >= 1000) throw new ValidationError('Watchlist full (1000 symbols max)');

      const itemId = ulid();
      const insertValues: typeof watchlistItems.$inferInsert = {
        id: itemId,
        tenantId: tenant.tenantId,
        watchlistId: id,
        symbolId: body.symbol,
        sortOrder: existing.length,
      };
      if (body.color !== undefined) insertValues.color = body.color;
      if (body.note !== undefined) insertValues.note = body.note;
      try {
        await db.insert(watchlistItems).values(insertValues);
      } catch {
        throw new ValidationError('Symbol already in watchlist');
      }
      return c.json({ id: itemId }, 201);
    },
  )
  .patch(
    '/watchlists/:id/items/:itemId',
    requireScope('write'),
    zValidator('json', UpdatePublicWatchlistItemSchema),
    async (c) => {
      const db = c.get('db');
      const tenant = tryGetTenant() as TenantContext;
      const id = c.req.param('id');
      const itemId = c.req.param('itemId');
      const body = c.req.valid('json');

      const [list] = await db
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, id),
            eq(watchlists.tenantId, tenant.tenantId),
            eq(watchlists.userId, tenant.userId),
          ),
        )
        .limit(1);
      if (!list) throw new NotFoundError('Watchlist not found');

      await db
        .update(watchlistItems)
        .set({
          ...(body.color !== undefined ? { color: body.color } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        })
        .where(
          and(
            eq(watchlistItems.id, itemId),
            eq(watchlistItems.tenantId, tenant.tenantId),
            eq(watchlistItems.watchlistId, id),
          ),
        );
      return c.json({ ok: true });
    },
  )
  .delete('/watchlists/:id/items/:itemId', requireScope('write'), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const itemId = c.req.param('itemId');

    const [list] = await db
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(
        and(
          eq(watchlists.id, id),
          eq(watchlists.tenantId, tenant.tenantId),
          eq(watchlists.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!list) throw new NotFoundError('Watchlist not found');

    await db
      .delete(watchlistItems)
      .where(
        and(
          eq(watchlistItems.id, itemId),
          eq(watchlistItems.tenantId, tenant.tenantId),
          eq(watchlistItems.watchlistId, id),
        ),
      );
    return c.json({ ok: true });
  })
  // ---- Indicators ----
  .get('/indicators', (c) => {
    return c.json({
      indicators: all().map((i) => ({
        id: i.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        name: i.name,
        category: i.category,
        overlay: i.overlay,
        defaults: i.defaults,
        minBars: i.minBars,
      })),
    });
  })
  .post('/indicators/compute', zValidator('json', IndicatorComputeBody), async (c) => {
    const body = c.req.valid('json');
    const def = find(body.id);
    if (!def) return c.json({ error: 'unknown_indicator' }, 404);

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const output = compute(body.id, result.bars, body.params ?? {});
    return c.json({
      indicator: { id: body.id, name: def.name, overlay: def.overlay },
      output,
    });
  })
  // ---- Screener ----
  .get('/screener/metrics', (c) => c.json({ metrics: screenerMetricCatalog }))
  .post('/screener', zValidator('json', ScreenerQuerySchema), async (c) => {
    const q = c.req.valid('json');
    const db = c.get('db');

    const rows = await db
      .select({
        id: symbols.id,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        country: symbols.country,
        sector: symbols.sector,
        industry: symbols.industry,
        active: symbols.active,
        marketCap: fundamentalSnapshots.marketCap,
        peRatio: fundamentalSnapshots.peRatio,
        eps: fundamentalSnapshots.eps,
        revenue: fundamentalSnapshots.revenue,
        dividendYield: fundamentalSnapshots.dividendYield,
        roe: fundamentalSnapshots.roe,
        revenueGrowth: fundamentalSnapshots.revenueGrowth,
        earningsGrowth: fundamentalSnapshots.earningsGrowth,
        beta: fundamentalSnapshots.beta,
        '52WeekHigh': fundamentalSnapshots.week52High,
        '52WeekLow': fundamentalSnapshots.week52Low,
        metadata: fundamentalSnapshots.metadata,
        exchange: exchanges.code,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .leftJoin(
        fundamentalSnapshots,
        and(
          eq(fundamentalSnapshots.symbolId, symbols.id),
          eq(fundamentalSnapshots.fiscalPeriod, 'ttm'),
          eq(fundamentalSnapshots.isLatest, true),
        ),
      )
      .where(maybeWhere(buildScreenerFilters(q)))
      .orderBy(screenerOrderBy(q.sort, q.direction), symbols.ticker)
      .limit(q.limit);

    return c.json({
      results: rows.map(
        ({
          marketCap,
          peRatio,
          eps,
          revenue,
          dividendYield,
          roe,
          revenueGrowth,
          earningsGrowth,
          beta,
          '52WeekHigh': week52High,
          '52WeekLow': week52Low,
          metadata,
          ...row
        }) => ({
          ...row,
          metrics: {
            ...readScreenerMetrics(metadata),
            ...readScreenerMetrics({
              marketCap,
              peRatio,
              eps,
              revenue,
              dividendYield,
              roe,
              revenueGrowth,
              earningsGrowth,
              beta,
              '52WeekHigh': week52High,
              '52WeekLow': week52Low,
            }),
          },
        }),
      ),
    });
  })
  // ---- News ----
  .get('/news', zValidator('query', NewsQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const filters: SQL[] = [];

    if (q.symbol) filters.push(newsSymbolFilter(q.symbol));
    if (q.source) filters.push(ilike(newsArticles.source, q.source));
    if (q.sentiment) filters.push(ilike(newsArticles.sentiment, q.sentiment));
    if (q.from) filters.push(gte(newsArticles.publishedAt, q.from));
    if (q.to) filters.push(lte(newsArticles.publishedAt, q.to));
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(newsArticles.title, like), ilike(newsArticles.body, like))!);
    }

    const rows = await db
      .select({
        id: newsArticles.id,
        source: newsArticles.source,
        url: newsArticles.url,
        title: newsArticles.title,
        body: newsArticles.body,
        symbols: newsArticles.symbols,
        sentiment: newsArticles.sentiment,
        publishedAt: newsArticles.publishedAt,
        fetchedAt: newsArticles.fetchedAt,
      })
      .from(newsArticles)
      .where(maybeWhere(filters))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(q.limit);

    return c.json({ articles: rows });
  });

// ── OpenAPI document ─────────────────────────────────────────────────────────

/** OpenAPI 3.1 description of the public `/v1` surface. Served unauthenticated. */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'tradingviu Public API',
    version: '1.0.0',
    description:
      'Read access to market data, indicators, screener, and news. Authenticate with a ' +
      'personal access token: `Authorization: Bearer tvk_…` (or the `X-API-Key` header). ' +
      'Tokens need the `read` scope. Requests are rate limited per token (see the ' +
      '`X-RateLimit-*` response headers; a `429` is returned when the limit is exceeded).',
  },
  servers: [{ url: '/v1' }],
  security: [{ apiKey: [] }, { bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Personal access token (tvk_…).' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      Symbol: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ticker: { type: 'string' },
          name: { type: 'string' },
          assetClass: { type: 'string' },
          currency: { type: 'string' },
          exchange: { type: 'string' },
        },
      },
      Bar: {
        type: 'object',
        properties: {
          time: { type: 'integer', description: 'UTC seconds' },
          open: { type: 'number' },
          high: { type: 'number' },
          low: { type: 'number' },
          close: { type: 'number' },
          volume: { type: 'number' },
        },
      },
      IndicatorDef: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: {
            type: 'string',
            enum: ['overlap', 'momentum', 'volatility', 'volume', 'trend'],
          },
          overlay: { type: 'boolean' },
          defaults: { type: 'object' },
          minBars: { type: 'integer' },
        },
      },
      IndicatorPoint: {
        type: 'object',
        properties: {
          time: { type: 'integer', description: 'UTC seconds' },
          value: { type: 'number' },
        },
      },
      IndicatorLine: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          color: { type: 'string' },
          type: { type: 'string', enum: ['line', 'histogram', 'band', 'cloud'] },
        },
      },
      IndicatorOutput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          overlay: { type: 'boolean' },
          lines: { type: 'array', items: { $ref: '#/components/schemas/IndicatorLine' } },
          points: { type: 'array', items: { $ref: '#/components/schemas/IndicatorPoint' } },
          bands: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                time: { type: 'integer' },
                upper: { type: 'number' },
                middle: { type: 'number' },
                lower: { type: 'number' },
              },
            },
          },
          histogram: { type: 'array', items: { $ref: '#/components/schemas/IndicatorPoint' } },
        },
      },
      ScreenerMetric: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          group: { type: 'string' },
          format: { type: 'string', enum: ['compact', 'price', 'ratio', 'percent', 'number'] },
          stored: { type: 'boolean' },
        },
      },
      ScreenerResult: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ticker: { type: 'string' },
          name: { type: 'string' },
          assetClass: { type: 'string' },
          currency: { type: 'string' },
          country: { type: 'string' },
          sector: { type: 'string' },
          industry: { type: 'string' },
          active: { type: 'boolean' },
          exchange: { type: 'string' },
          metrics: { type: 'object', description: 'Key-value of numeric metrics' },
        },
      },
      NewsArticle: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          symbols: { type: 'array', items: { type: 'string' } },
          sentiment: { type: 'string', enum: ['negative', 'neutral', 'positive'] },
          publishedAt: { type: 'string', format: 'date-time' },
          fetchedAt: { type: 'string', format: 'date-time' },
        },
      },
      Watchlist: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      WatchlistItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          symbolId: { type: 'string' },
          color: { type: 'string', nullable: true },
          note: { type: 'string', nullable: true },
          sortOrder: { type: 'integer' },
          symbol: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              ticker: { type: 'string' },
              name: { type: 'string' },
              exchange: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/symbols': {
      get: {
        summary: 'List symbols',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search ticker/name' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
        ],
        responses: {
          '200': {
            description: 'Matching symbols',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    symbols: { type: 'array', items: { $ref: '#/components/schemas/Symbol' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/symbols/{id}/history': {
      get: {
        summary: 'OHLCV history for a symbol',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'interval',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
              default: '1h',
            },
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 300, maximum: 2000 } },
        ],
        responses: {
          '200': {
            description: 'Bars',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    symbol: { type: 'string' },
                    interval: { type: 'string' },
                    bars: { type: 'array', items: { $ref: '#/components/schemas/Bar' } },
                  },
                },
              },
            },
          },
          '404': { description: 'Symbol not found' },
        },
      },
    },
    '/watchlists': {
      get: {
        summary: 'List watchlists owned by the token user',
        responses: {
          '200': {
            description: 'Watchlists',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    watchlists: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Watchlist' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a watchlist',
        description: 'Requires a token with the `write` scope.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', maxLength: 80 } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created watchlist id',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
          '403': { description: 'Missing write scope' },
        },
      },
    },
    '/watchlists/{id}': {
      delete: {
        summary: 'Delete a watchlist',
        description: 'Requires a token with the `write` scope.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '403': { description: 'Missing write scope' },
          '404': { description: 'Watchlist not found' },
        },
      },
    },
    '/watchlists/{id}/items': {
      get: {
        summary: 'List watchlist items',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Watchlist items',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/WatchlistItem' },
                    },
                  },
                },
              },
            },
          },
          '404': { description: 'Watchlist not found' },
        },
      },
      post: {
        summary: 'Add a symbol to a watchlist',
        description: 'Requires a token with the `write` scope.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['symbol'],
                properties: {
                  symbol: { type: 'string', description: 'Symbol id' },
                  note: { type: 'string', maxLength: 200 },
                  color: { type: 'string', maxLength: 20 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created item id',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
          '403': { description: 'Missing write scope' },
          '404': { description: 'Watchlist not found' },
          '422': { description: 'Invalid symbol or duplicate item' },
        },
      },
    },
    '/watchlists/{id}/items/{itemId}': {
      patch: {
        summary: 'Update a watchlist item',
        description: 'Requires a token with the `write` scope.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  note: { type: 'string', maxLength: 200, nullable: true },
                  color: { type: 'string', maxLength: 20, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated' },
          '403': { description: 'Missing write scope' },
          '404': { description: 'Watchlist not found' },
        },
      },
      delete: {
        summary: 'Remove a watchlist item',
        description: 'Requires a token with the `write` scope.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Deleted' },
          '403': { description: 'Missing write scope' },
          '404': { description: 'Watchlist not found' },
        },
      },
    },
    '/indicators': {
      get: {
        summary: 'List available technical indicators',
        responses: {
          '200': {
            description: 'Indicator definitions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    indicators: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/IndicatorDef' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/indicators/compute': {
      post: {
        summary: 'Compute an indicator on historical bars',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'symbol'],
                properties: {
                  id: { type: 'string', description: 'Indicator ID (e.g. "sma", "rsi")' },
                  symbol: { type: 'string', description: 'Symbol ID' },
                  interval: {
                    type: 'string',
                    enum: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
                    default: '1h',
                  },
                  params: { type: 'object', description: 'Indicator parameters' },
                  limit: { type: 'integer', default: 500, maximum: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Computed indicator output',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    indicator: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        overlay: { type: 'boolean' },
                      },
                    },
                    output: { $ref: '#/components/schemas/IndicatorOutput' },
                  },
                },
              },
            },
          },
          '404': { description: 'Unknown indicator' },
        },
      },
    },
    '/screener/metrics': {
      get: {
        summary: 'List available screener metrics',
        responses: {
          '200': {
            description: 'Metric catalog',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    metrics: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ScreenerMetric' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/screener': {
      post: {
        summary: 'Run a screener query',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  q: { type: 'string', description: 'Search ticker/name/sector/industry' },
                  assetClass: { type: 'string' },
                  exchange: { type: 'string' },
                  country: { type: 'string' },
                  sector: { type: 'string' },
                  industry: { type: 'string' },
                  active: { type: 'boolean', default: true },
                  filters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                  },
                  sort: { type: 'string', default: 'marketCap' },
                  direction: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
                  limit: { type: 'integer', default: 100, maximum: 500 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Screener results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ScreenerResult' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/news': {
      get: {
        summary: 'List news articles',
        parameters: [
          {
            name: 'symbol',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by symbol ticker',
          },
          {
            name: 'source',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by source',
          },
          {
            name: 'sentiment',
            in: 'query',
            schema: { type: 'string' },
            description: 'positive/neutral/negative',
          },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search title/body' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'News articles',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    articles: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/NewsArticle' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
