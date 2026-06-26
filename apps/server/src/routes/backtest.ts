import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  BacktestSettingsSchema,
  OptimizeObjectiveSchema,
  StrategyConfigSchema,
  StrategyTypeSchema,
  optimize,
  runBacktest,
  simulate,
  signalsFromSeries,
  strategyCatalog,
  walkForward,
} from '@tv/backtest-engine';
import { compileAndRun, PineRuntimeError } from '@tv/pine-runtime';
import { PineParseError } from '@tv/pine-parser';
import { getFreshBars } from '../services/market-data.js';

const BacktestBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(5000).default(1000),
  strategy: StrategyConfigSchema,
  settings: BacktestSettingsSchema.default({}),
});

const PineBacktestBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(5000).default(1000),
  source: z.string().min(1).max(20_000),
  inputs: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
  /** Which plot to read as the position signal; defaults to "signal" or plot 0. */
  signalPlot: z.string().optional(),
  settings: BacktestSettingsSchema.default({}),
});

const OptimizeBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(5000).default(1000),
  type: StrategyTypeSchema,
  paramGrid: z.record(z.string(), z.array(z.coerce.number().finite()).min(1).max(50)),
  settings: BacktestSettingsSchema.default({}),
  objective: OptimizeObjectiveSchema.default('netProfitPct'),
  maxCombos: z.coerce.number().int().positive().max(2000).default(400),
  topN: z.coerce.number().int().positive().max(200).default(50),
});

const WalkForwardBody = z.object({
  symbol: z.string(),
  interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w']).default('1h'),
  limit: z.coerce.number().int().positive().max(5000).default(1500),
  type: StrategyTypeSchema,
  paramGrid: z.record(z.string(), z.array(z.coerce.number().finite()).min(1).max(50)),
  settings: BacktestSettingsSchema.default({}),
  objective: OptimizeObjectiveSchema.default('netProfitPct'),
  inSampleBars: z.coerce.number().int().min(2).max(5000).default(300),
  outOfSampleBars: z.coerce.number().int().min(1).max(5000).default(100),
  maxCombos: z.coerce.number().int().positive().max(2000).default(200),
});

export const backtestRoutes = new Hono()
  .get('/backtest/strategies', (c) => c.json({ strategies: strategyCatalog }))
  .post('/backtest', zValidator('json', BacktestBody), async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const resultBars = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = resultBars.bars;

    const result = runBacktest(bars, body.strategy, body.settings);

    return c.json({ symbol: resultBars.symbol, interval: body.interval, bars: bars.length, result });
  })
  .post('/backtest/optimize', zValidator('json', OptimizeBody), async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const resultBars = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = resultBars.bars;

    const optimization = optimize(bars, body.type, body.paramGrid, body.settings, {
      objective: body.objective,
      maxCombos: body.maxCombos,
      topN: body.topN,
    });

    return c.json({ symbol: resultBars.symbol, interval: body.interval, bars: bars.length, optimization });
  })
  .post('/backtest/walkforward', zValidator('json', WalkForwardBody), async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const resultBars = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = resultBars.bars;

    const result = walkForward(bars, body.type, body.paramGrid, body.settings, {
      objective: body.objective,
      inSampleBars: body.inSampleBars,
      outOfSampleBars: body.outOfSampleBars,
      maxCombos: body.maxCombos,
    });

    return c.json({ symbol: resultBars.symbol, interval: body.interval, bars: bars.length, walkForward: result });
  })
  .post('/backtest/pine', zValidator('json', PineBacktestBody), async (c) => {
    const body = c.req.valid('json');

    const db = c.get('db');
    const resultBars = await getFreshBars(db, body.symbol, body.interval, { limit: body.limit });
    const bars = resultBars.bars;

    try {
      const pine = compileAndRun(body.source, bars, body.inputs ?? {});
      if (pine.plots.length === 0) {
        return c.json({ ok: false, error: { kind: 'signal', message: 'Script has no plots to read as a signal' } }, 400);
      }
      const chosen = body.signalPlot
        ? pine.plots.find((p) => p.title === body.signalPlot)
        : (pine.plots.find((p) => p.title.toLowerCase() === 'signal') ?? pine.plots[0]);
      if (!chosen) {
        return c.json({ ok: false, error: { kind: 'signal', message: 'Signal plot not found' } }, 400);
      }
      const signals = signalsFromSeries(chosen.data);
      const result = simulate(bars, signals, body.settings);
      return c.json({
        ok: true,
        symbol: resultBars.symbol,
        interval: body.interval,
        bars: bars.length,
        signalPlot: chosen.title,
        plots: pine.plots.map((p) => p.title),
        result,
      });
    } catch (e) {
      if (e instanceof PineParseError) {
        return c.json({ ok: false, error: { kind: 'parse', message: e.message, ...(e.location ?? {}) } }, 400);
      }
      if (e instanceof PineRuntimeError) {
        return c.json({ ok: false, error: { kind: 'runtime', message: e.message } }, 400);
      }
      throw e;
    }
  });
