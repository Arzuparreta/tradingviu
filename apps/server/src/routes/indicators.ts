import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { all, compute, find } from '@tv/ta-lib';
import { eq } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { getProvider } from '../services/data.js';

const IndicatorQuery = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

const IndicatorComputeBody = z.object({
  id: z.string(),
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  params: z.record(z.number()).optional(),
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

export const indicatorRoutes = new Hono()
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
  .get('/indicators/:id', (c) => {
    const id = c.req.param('id');
    const def = find(id);
    if (!def) return c.json({ error: 'not_found' }, 404);
    return c.json({ indicator: { id, ...def } });
  })
  .post('/indicators/compute', zValidator('json', IndicatorComputeBody), async (c) => {
    const body = c.req.valid('json');
    const def = find(body.id);
    if (!def) return c.json({ error: 'unknown_indicator' }, 404);

    const db = c.get('db');
    const [row] = await db
      .select({ id: symbols.id, ticker: symbols.ticker, exchange: exchanges.code })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(eq(symbols.id, body.symbol))
      .limit(1);
    if (!row) return c.json({ error: 'symbol_not_found' }, 404);

    const providerId = ccxtMap[row.exchange] ?? 'binance';
    const provider = getProvider(providerId);
    const bars = await provider.fetchHistorical({
      symbol: row.ticker,
      interval: body.interval,
      limit: body.limit,
    });
    const output = compute(body.id, bars, body.params ?? {});
    return c.json({
      indicator: { id: body.id, name: def.name, overlay: def.overlay },
      output,
    });
  })
  .get('/indicators/history', zValidator('query', IndicatorQuery), async (c) => {
    const q = c.req.valid('query');
    const db = c.get('db');
    const [row] = await db
      .select({ id: symbols.id, ticker: symbols.ticker, exchange: exchanges.code })
      .from(symbols)
      .innerJoin(exchanges, eq(exchanges.id, symbols.exchangeId))
      .where(eq(symbols.id, q.symbol))
      .limit(1);
    if (!row) return c.json({ error: 'symbol_not_found' }, 404);
    const providerId = ccxtMap[row.exchange] ?? 'binance';
    const provider = getProvider(providerId);
    const bars = await provider.fetchHistorical({
      symbol: row.ticker,
      interval: q.interval,
      limit: q.limit,
    });
    return c.json({ symbol: row, interval: q.interval, bars });
  });
