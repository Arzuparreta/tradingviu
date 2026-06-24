import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { symbols, exchanges, dataSubscriptions } from '@tv/db/schema';
import { tryGetTenant, type TenantContext } from '@tv/core';

const QuerySchema = z.object({
  q: z.string().min(1).max(80),
  assetClass: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const HistoricalQuery = z.object({
  symbol: z.string().min(1),
  interval: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(500),
});

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
        r.ticker.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()),
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

export const chartRoutes = new Hono().get(
  '/chart/history',
  zValidator('query', HistoricalQuery),
  async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const [row] = await db
      .select({ id: symbols.id, ticker: symbols.ticker, exchange: exchanges.code })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(eq(symbols.id, q.symbol))
      .limit(1);

    if (!row) {
      const { NotFoundError } = await import('@tv/core');
      throw new NotFoundError('Symbol not found', { symbol: q.symbol });
    }

    const ccxtMap: Record<string, string> = {
      BINANCE: 'binance',
      COINBASE: 'coinbase',
      KRAKEN: 'kraken',
      BYBIT: 'bybit',
    };
    const providerId = ccxtMap[row.exchange] ?? 'binance';

    const { getProvider } = await import('../services/data.js');
    const provider = getProvider(providerId);
    const bars = await provider.fetchHistorical({
      symbol: row.ticker,
      interval: q.interval,
      from: q.from,
      to: q.to,
      limit: q.limit,
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

    return c.json({ symbol: row, interval: q.interval, bars });
  },
);
