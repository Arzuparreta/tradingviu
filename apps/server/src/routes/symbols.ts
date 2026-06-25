import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { symbols, exchanges, dataSubscriptions } from '@tv/db/schema';
import { DomQuerySchema, IntervalSchema, NotFoundError, tryGetTenant, type TenantContext } from '@tv/core';
import { buildDomBook } from '../services/depth.js';
import { getBarStore, getProvider } from '../services/data.js';

const QuerySchema = z.object({
  q: z.string().min(1).max(80),
  assetClass: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const HistoricalQuery = z.object({
  symbol: z.string().min(1),
  interval: IntervalSchema,
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  before: z.coerce.number().int().optional(),
  after: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(500),
});

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

const findSymbol = async (db: ReturnType<typeof import('@tv/db').createDb>, symbolId: string) => {
  const [row] = await db
    .select({
      id: symbols.id,
      ticker: symbols.ticker,
      name: symbols.name,
      exchange: exchanges.code,
      assetClass: symbols.assetClass,
      currency: symbols.currency,
    })
    .from(symbols)
    .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
    .where(eq(symbols.id, symbolId))
    .limit(1);
  if (!row) throw new NotFoundError('Symbol not found', { symbol: symbolId });
  return row;
};

export const symbolRoutes = new Hono()
  .get('/symbols/search', zValidator('query', QuerySchema), async (c) => {
    const { q, limit, assetClass } = c.req.valid('query');
    const db = c.get('db');
    const rows = await db
      .select({
        id: symbols.id,
        exchange: exchanges.code,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        active: symbols.active,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(assetClass ? eq(symbols.assetClass, assetClass) : undefined)
      .limit(limit);
    const filtered = rows.filter(
      (r: { ticker: string; name: string }) =>
        r.ticker.toLowerCase().includes(q.toLowerCase()) ||
        r.name.toLowerCase().includes(q.toLowerCase()),
    );
    return c.json({ results: filtered.length ? filtered : rows.slice(0, limit) });
  })
  .get('/symbols', async (c) => {
    const db = c.get('db');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500);
    const assetClass = c.req.query('assetClass');
    const rows = await db
      .select({
        id: symbols.id,
        exchange: exchanges.code,
        ticker: symbols.ticker,
        name: symbols.name,
        assetClass: symbols.assetClass,
        currency: symbols.currency,
        active: symbols.active,
      })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(assetClass ? eq(symbols.assetClass, assetClass) : undefined)
      .limit(limit);
    return c.json({ results: rows });
  });

export const chartRoutes = new Hono()
  .get('/chart/history', zValidator('query', HistoricalQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const row = await findSymbol(db, q.symbol);
    const providerId = ccxtMap[row.exchange] ?? 'binance';
    const barStore = getBarStore();

    // Normalize the range: `before`/`after` are convenience aliases for `to`/`from`.
    // `before` means "give me bars older than this" (the classic infinite-scroll
    // request), `after` means "give me bars newer than this".
    const rangeFrom = q.from ?? q.after;
    const rangeTo = q.to ?? (q.before !== undefined ? q.before - 1 : undefined);

    const fromBarStore = await barStore.getRange(
      { provider: providerId, ticker: row.ticker, interval: q.interval },
      {
        ...(rangeFrom !== undefined ? { from: rangeFrom } : {}),
        ...(rangeTo !== undefined ? { to: rangeTo } : {}),
        limit: q.limit,
      },
    );

    let bars = fromBarStore;
    let fellBackToExchange = false;

    // If memory + DB came up short, fall back to the exchange for a one-shot
    // backfill of the requested range. This is rare (only when a brand-new
    // key is queried for a range the BarStore hasn't backfilled yet).
    if (bars.length < q.limit) {
      const provider = getProvider(providerId);
      const exchangeBars = await provider.fetchHistorical({
        symbol: row.ticker,
        interval: q.interval,
        ...(rangeFrom !== undefined ? { from: rangeFrom } : {}),
        ...(rangeTo !== undefined ? { to: rangeTo } : {}),
        limit: q.limit,
      });
      if (exchangeBars.length > bars.length) {
        bars = exchangeBars;
        fellBackToExchange = true;
      }
    }

    // Touch the stream so the WS path is hot for the next chart interaction.
    void barStore.ensureStream({
      provider: providerId,
      ticker: row.ticker,
      interval: q.interval,
    });

    const tenant = tryGetTenant() as TenantContext;
    const lastBar = bars.at(-1);
    await db
      .insert(dataSubscriptions)
      .values({
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        symbolId: row.id,
        intervals: [q.interval],
        realtimeEnabled: false,
        lastBarAt: lastBar ? new Date(lastBar.time * 1000) : null,
      })
      .onConflictDoNothing();

    return c.json({
      symbol: row,
      interval: q.interval,
      bars,
      source: fellBackToExchange ? ('exchange' as const) : ('barstore' as const),
    });
  })
  .get('/chart/dom', zValidator('query', DomQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const row = await findSymbol(db, q.symbol);
    const providerId = ccxtMap[row.exchange] ?? 'binance';
    const provider = getProvider(providerId);
    const bars = await provider.fetchHistorical({
      symbol: row.ticker,
      interval: '1m',
      limit: 100,
    });
    const last = bars.at(-1);
    if (!last) throw new NotFoundError('No market data available for DOM', { symbol: q.symbol });
    const recent = bars.slice(-30);
    const high = Math.max(...recent.map((bar) => bar.high), last.high);
    const low = Math.min(...recent.map((bar) => bar.low), last.low);
    const volume = recent.reduce((sum, bar) => sum + bar.volume, 0);
    const book = buildDomBook({
      lastPrice: last.close,
      high,
      low,
      volume,
      levels: q.levels,
      ...(q.tickSize !== undefined ? { tickSize: q.tickSize } : {}),
    });
    return c.json({ symbol: row, book });
  });
