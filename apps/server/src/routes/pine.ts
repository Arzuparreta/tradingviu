import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { validate, compileAndRun, PineRuntimeError } from '@tv/pine-runtime';
import { PineParseError } from '@tv/pine-parser';
import { getFreshBars } from '../services/market-data.js';

const ValidateBody = z.object({
  source: z.string().min(1).max(20000),
});

const RunBody = z.object({
  source: z.string().min(1).max(20000),
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  inputs: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

export const pineRoutes = new Hono()
  .post('/pine/validate', zValidator('json', ValidateBody), (c) => {
    const { source } = c.req.valid('json');
    return c.json(validate(source));
  })
  .post('/pine/run', zValidator('json', RunBody), async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const result = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = result.bars;

    try {
      const result = compileAndRun(body.source, bars, body.inputs ?? {});
      return c.json({ ok: true, result });
    } catch (e) {
      if (e instanceof PineParseError) {
        return c.json(
          { ok: false, error: { kind: 'parse', message: e.message, ...(e.location ?? {}) } },
          400,
        );
      }
      if (e instanceof PineRuntimeError) {
        return c.json({ ok: false, error: { kind: 'runtime', message: e.message } }, 400);
      }
      throw e;
    }
  });
