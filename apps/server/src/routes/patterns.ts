import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { allPatterns, detectAll, findPattern } from '@tv/candlestick-patterns';
import { getFreshBars } from '../services/market-data.js';

const PatternScanBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(2000).default(500),
  ids: z.array(z.string()).optional(),
});

export const patternRoutes = new Hono()
  .get('/patterns', (c) => {
    return c.json({ patterns: allPatterns() });
  })
  .post('/patterns/scan', zValidator('json', PatternScanBody), async (c) => {
    const body = c.req.valid('json');

    if (body.ids && !body.ids.every((id) => findPattern(id))) {
      return c.json({ error: 'unknown_pattern' }, 400);
    }

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    const matches = detectAll(bars, body.ids ? { ids: body.ids } : {});
    return c.json({
      symbol: result.symbol,
      interval: body.interval,
      bars: bars.length,
      matches,
    });
  });
