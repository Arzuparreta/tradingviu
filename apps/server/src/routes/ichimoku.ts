import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { computeIchimoku } from '@tv/ichimoku';
import { eq } from 'drizzle-orm';
import { symbols, exchanges } from '@tv/db/schema';
import { getProvider } from '../services/data.js';

const IchimokuBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  tenkan: z.coerce.number().int().min(1).max(100).default(9),
  kijun: z.coerce.number().int().min(1).max(200).default(26),
  senkou: z.coerce.number().int().min(1).max(400).default(52),
  displacement: z.coerce.number().int().min(0).max(200).default(26),
});

const ccxtMap: Record<string, string> = {
  BINANCE: 'binance',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  BYBIT: 'bybit',
};

export const ichimokuRoutes = new Hono().post(
  '/ichimoku',
  zValidator('json', IchimokuBody),
  async (c) => {
    const body = c.req.valid('json');

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

    const ichimoku = computeIchimoku(bars, {
      tenkan: body.tenkan,
      kijun: body.kijun,
      senkou: body.senkou,
      displacement: body.displacement,
    });

    return c.json({
      symbol: row,
      interval: body.interval,
      bars: bars.length,
      ichimoku,
    });
  },
);
