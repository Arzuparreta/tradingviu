import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { computePivotPoints, PivotMethodSchema, PivotPeriodSchema } from '@tv/pivot-points';
import { getFreshBars } from '../services/market-data.js';

const PivotPointsBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  method: PivotMethodSchema.default('standard'),
  period: PivotPeriodSchema.default('D'),
});

export const pivotPointsRoutes = new Hono().post(
  '/pivot-points',
  zValidator('json', PivotPointsBody),
  async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    const pivots = computePivotPoints(bars, { method: body.method, period: body.period });

    return c.json({ symbol: result.symbol, interval: body.interval, bars: bars.length, pivots });
  },
);
