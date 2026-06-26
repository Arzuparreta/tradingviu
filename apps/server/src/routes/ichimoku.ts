import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { computeIchimoku } from '@tv/ichimoku';
import { getFreshBars } from '../services/market-data.js';

const IchimokuBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  tenkan: z.coerce.number().int().min(1).max(100).default(9),
  kijun: z.coerce.number().int().min(1).max(200).default(26),
  senkou: z.coerce.number().int().min(1).max(400).default(52),
  displacement: z.coerce.number().int().min(0).max(200).default(26),
});

export const ichimokuRoutes = new Hono().post(
  '/ichimoku',
  zValidator('json', IchimokuBody),
  async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    const ichimoku = computeIchimoku(bars, {
      tenkan: body.tenkan,
      kijun: body.kijun,
      senkou: body.senkou,
      displacement: body.displacement,
    });

    return c.json({
      symbol: result.symbol,
      interval: body.interval,
      bars: bars.length,
      ichimoku,
    });
  },
);
