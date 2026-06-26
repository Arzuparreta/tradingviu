import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  exchanges,
  fundamentalSnapshots,
  newsArticles,
  symbols,
} from '@tv/db/schema';
import { all, compute, find } from '@tv/ta-lib';
import {
  buildScreenerFilters,
  maybeWhere,
  readScreenerMetrics,
  screenerMetricCatalog,
  screenerOrderBy,
} from '@tv/screener-engine';
import type { NewsQuery } from '@tv/core';
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

const ScreenerQueryV1 = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  assetClass: z.string().trim().min(1).max(40).optional(),
  exchange: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(1).max(80).optional(),
  sector: z.string().trim().min(1).max(120).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  active: z.coerce.boolean().default(true),
  filters: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        min: z.coerce.number().finite().optional(),
        max: z.coerce.number().finite().optional(),
      }),
    )
    .max(60)
    .default([]),
  sort: z.string().trim().min(1).max(60).default('marketCap'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

const NewsQueryV1 = z.object({
  symbol: z.string().trim().min(1).max(32).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  sentiment: z.string().trim().min(1).max(32).optional(),
  q: z.string().trim().min(1).max(160).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
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
  // ---- Symbols ----
  .get('/symbols', requireScope('read'), zValidator('query', SymbolsQuery), async (c) => {
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
  .get('/symbols/:id/history', requireScope('read'), zValidator('query', HistoryQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const result = await getFreshBars(db, c.req.param('id'), q.interval, { limit: q.limit });
    return c.json({ symbol: result.symbol, interval: q.interval, bars: result.bars });
  })
  // ---- Indicators ----
  .get('/indicators', requireScope('read'), (c) => {
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
  .post('/indicators/compute', requireScope('read'), zValidator('json', IndicatorComputeBody), async (c) => {
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
  .get('/screener/metrics', requireScope('read'), (c) => c.json({ metrics: screenerMetricCatalog }))
  .post('/screener', requireScope('read'), zValidator('json', ScreenerQueryV1), async (c) => {
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
      .where(maybeWhere(buildScreenerFilters(q as unknown as Parameters<typeof buildScreenerFilters>[0])))
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
  .get('/news', requireScope('read'), zValidator('query', NewsQueryV1), async (c) => {
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
          category: { type: 'string', enum: ['overlap', 'momentum', 'volatility', 'volume', 'trend'] },
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
          { name: 'symbol', in: 'query', schema: { type: 'string' }, description: 'Filter by symbol ticker' },
          { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Filter by source' },
          { name: 'sentiment', in: 'query', schema: { type: 'string' }, description: 'positive/neutral/negative' },
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
