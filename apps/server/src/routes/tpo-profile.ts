import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { computeTpoProfile } from '@tv/tpo-profile';
import { getFreshBars } from '../services/market-data.js';

const TpoProfileBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  bins: z.coerce.number().int().min(4).max(200).default(24),
  valueAreaPct: z.coerce.number().min(0.5).max(0.95).default(0.7),
  barsPerPeriod: z.coerce.number().int().min(1).max(120).default(1),
});

export const tpoProfileRoutes = new Hono().post(
  '/tpo-profile',
  zValidator('json', TpoProfileBody),
  async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    const profile = computeTpoProfile(bars, {
      bins: body.bins,
      valueAreaPct: body.valueAreaPct,
      barsPerPeriod: body.barsPerPeriod,
    });

    return c.json({
      symbol: result.symbol,
      interval: body.interval,
      bars: bars.length,
      profile,
    });
  },
);
