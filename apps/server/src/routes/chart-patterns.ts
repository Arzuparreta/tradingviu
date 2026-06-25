import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { allChartPatterns, scanChartPatterns, findChartPattern } from '@tv/chart-patterns';
import { eq } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { getProvider } from '../services/data.js';

const ChartPatternScanBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  ids: z.array(z.string()).optional(),
});

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

export const chartPatternRoutes = new Hono()
  .get('/chart-patterns', (c) => {
    return c.json({ patterns: allChartPatterns() });
  })
  .post('/chart-patterns/scan', zValidator('json', ChartPatternScanBody), async (c) => {
    const body = c.req.valid('json');

    if (body.ids && !body.ids.every((id) => findChartPattern(id))) {
      return c.json({ error: 'unknown_pattern' }, 400);
    }

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

    const matches = scanChartPatterns(bars, body.ids ? { ids: body.ids } : {});
    return c.json({
      symbol: row,
      interval: body.interval,
      bars: bars.length,
      matches,
    });
  });
