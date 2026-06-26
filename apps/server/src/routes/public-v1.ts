import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { requireScope } from '../middleware/api-key.js';
import { getFreshBars } from '../services/market-data.js';

const SymbolsQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

const HistoryQuery = z.object({
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(300),
});

/** Public, API-key-authenticated read surface. Mounted under `/v1`. */
export const publicV1Routes = new Hono()
  .use('*', requireScope('read'))
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
  });

/** OpenAPI 3.1 description of the public `/v1` surface. Served unauthenticated. */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'tradingviu Public API',
    version: '1.0.0',
    description:
      'Read access to market data. Authenticate with a personal access token: ' +
      '`Authorization: Bearer tvk_…` (or the `X-API-Key` header). Tokens need the ' +
      '`read` scope. Requests are rate limited per token (see the `X-RateLimit-*` ' +
      'response headers; a `429` is returned when the limit is exceeded).',
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
            schema: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'], default: '1h' },
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
  },
} as const;
