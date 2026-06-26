import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { allChartPatterns, scanChartPatterns, findChartPattern } from '@tv/chart-patterns';
import { getFreshBars } from '../services/market-data.js';

const ChartPatternScanBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  ids: z.array(z.string()).optional(),
});

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
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    const matches = scanChartPatterns(bars, body.ids ? { ids: body.ids } : {});
    return c.json({
      symbol: result.symbol,
      interval: body.interval,
      bars: bars.length,
      matches,
    });
  });
