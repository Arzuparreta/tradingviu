import type { Bar } from '@tv/data-types';
import type {
  BacktestSettings,
  OptimizeObjective,
  StrategyType,
  WalkForwardFold,
  WalkForwardResult,
} from './types.js';
import { optimize, objectiveScore } from './optimize.js';
import { runBacktest } from './backtest.js';

export interface WalkForwardOptions {
  readonly objective?: OptimizeObjective;
  /** Bars per in-sample (optimization) window (default 300). */
  readonly inSampleBars?: number;
  /** Bars per out-of-sample (test) window, also the slide step (default 100). */
  readonly outOfSampleBars?: number;
  /** Combination cap passed to each in-sample optimization (default 200). */
  readonly maxCombos?: number;
}

const avg = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Walk-forward analysis: slide a rolling in-sample window across `bars`,
 * optimize the strategy's parameters on each window, then measure those params
 * on the immediately-following out-of-sample window. Out-of-sample windows are
 * contiguous and non-overlapping (the window also being the slide step), so the
 * stitched OOS performance is a realistic, overfitting-resistant estimate. Pure
 * and deterministic.
 */
export const walkForward = (
  bars: ReadonlyArray<Bar>,
  type: StrategyType,
  paramGrid: Record<string, readonly number[]>,
  settings: Partial<BacktestSettings> = {},
  opts: WalkForwardOptions = {},
): WalkForwardResult => {
  const objective = opts.objective ?? 'netProfitPct';
  const inSampleBars = Math.max(2, Math.floor(opts.inSampleBars ?? 300));
  const outOfSampleBars = Math.max(1, Math.floor(opts.outOfSampleBars ?? 100));
  const maxCombos = opts.maxCombos ?? 200;

  const folds: WalkForwardFold[] = [];
  for (let start = 0; start + inSampleBars + 1 <= bars.length; start += outOfSampleBars) {
    const inEndExcl = start + inSampleBars;
    const outEndExcl = Math.min(inEndExcl + outOfSampleBars, bars.length);
    if (outEndExcl <= inEndExcl) break;

    const inBars = bars.slice(start, inEndExcl);
    const outBars = bars.slice(inEndExcl, outEndExcl);

    const opt = optimize(inBars, type, paramGrid, settings, { objective, maxCombos, topN: 1 });
    const top = opt.results[0];
    if (!top) break;

    const oosResult = runBacktest(outBars, { type, params: top.params }, settings);
    folds.push({
      inStart: inBars[0]!.time,
      inEnd: inBars[inBars.length - 1]!.time,
      outStart: outBars[0]!.time,
      outEnd: outBars[outBars.length - 1]!.time,
      bestParams: top.params,
      inSampleScore: objectiveScore(objective, top.stats),
      oosScore: objectiveScore(objective, oosResult.stats),
      oos: oosResult.stats,
    });
  }

  const foldCount = folds.length;
  const profitableFolds = folds.filter((f) => f.oos.netProfitPct > 0).length;
  const oosReturnCompounded = folds.reduce((acc, f) => acc * (1 + f.oos.netProfitPct), 1) - 1;
  const avgInSampleScore = avg(folds.map((f) => f.inSampleScore));
  const avgOosScore = avg(folds.map((f) => f.oosScore));

  return {
    type,
    objective,
    inSampleBars,
    outOfSampleBars,
    folds,
    aggregate: {
      foldCount,
      profitableFolds,
      profitableFoldPct: foldCount > 0 ? profitableFolds / foldCount : 0,
      oosReturnCompounded,
      avgOosReturn: avg(folds.map((f) => f.oos.netProfitPct)),
      avgInSampleScore,
      avgOosScore,
      walkForwardEfficiency: avgInSampleScore !== 0 ? avgOosScore / avgInSampleScore : 0,
      totalOosTrades: folds.reduce((s, f) => s + f.oos.totalTrades, 0),
    },
  };
};
