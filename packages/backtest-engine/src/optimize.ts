import type { Bar } from '@tv/data-types';
import type {
  BacktestSettings,
  OptimizeObjective,
  OptimizeResult,
  OptimizeResultRow,
  StrategyType,
} from './types.js';
import { runBacktest } from './backtest.js';

/** Cartesian product of `{ key: candidates[] }` as a list of param records. */
const cartesian = (grid: Record<string, readonly number[]>): Record<string, number>[] => {
  const keys = Object.keys(grid).filter((k) => (grid[k]?.length ?? 0) > 0);
  let combos: Record<string, number>[] = [{}];
  for (const key of keys) {
    const values = grid[key]!;
    const next: Record<string, number>[] = [];
    for (const combo of combos) {
      for (const v of values) next.push({ ...combo, [key]: v });
    }
    combos = next;
  }
  return combos;
};

/** Sortable score for a combo; higher is always better (drawdown is negated). */
const score = (objective: OptimizeObjective, row: OptimizeResultRow): number => {
  const s = row.stats;
  switch (objective) {
    case 'netProfitPct':
      return s.netProfitPct;
    case 'sharpe':
      return s.sharpe;
    case 'winRate':
      return s.winRate;
    case 'profitFactor':
      return s.profitFactor ?? (s.netProfit > 0 ? Number.MAX_VALUE : -1);
    case 'maxDrawdownPct':
      return -s.maxDrawdownPct; // smaller drawdown ranks higher
  }
};

export interface OptimizeOptions {
  readonly objective?: OptimizeObjective;
  /** Hard cap on combinations evaluated (default 400). */
  readonly maxCombos?: number;
  /** Keep only the top N ranked rows (default 50). */
  readonly topN?: number;
}

/**
 * Grid-search a built-in strategy's parameters over `bars`. Builds the cartesian
 * product of the candidate values in `paramGrid`, runs a full backtest for each
 * combination, and ranks them best-first by `objective`. Pure and deterministic:
 * a function of the bars, grid, and settings only. Combinations beyond
 * `maxCombos` are not evaluated (reported via `truncated`), and only the top
 * `topN` ranked rows are returned.
 */
export const optimize = (
  bars: ReadonlyArray<Bar>,
  type: StrategyType,
  paramGrid: Record<string, readonly number[]>,
  settings: Partial<BacktestSettings> = {},
  opts: OptimizeOptions = {},
): OptimizeResult => {
  const objective = opts.objective ?? 'netProfitPct';
  const maxCombos = Math.max(1, Math.floor(opts.maxCombos ?? 400));
  const topN = Math.max(1, Math.floor(opts.topN ?? 50));

  const allCombos = cartesian(paramGrid);
  const truncated = allCombos.length > maxCombos;
  const combos = truncated ? allCombos.slice(0, maxCombos) : allCombos;

  const rows: OptimizeResultRow[] = combos.map((params) => ({
    params,
    stats: runBacktest(bars, { type, params }, settings).stats,
  }));

  // Stable sort (preserves grid order for ties) on a higher-is-better score.
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = score(objective, b.row) - score(objective, a.row);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((x) => x.row)
    .slice(0, topN);

  return { type, objective, evaluated: combos.length, truncated, results: ranked };
};
