import { z } from 'zod';

/** Built-in strategy identifiers. */
export const StrategyTypeSchema = z.enum(['maCross', 'rsiReversal', 'donchianBreakout']);
export type StrategyType = z.infer<typeof StrategyTypeSchema>;

export const StrategyConfigSchema = z.object({
  type: StrategyTypeSchema,
  params: z.record(z.string(), z.coerce.number().finite()).default({}),
});
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;

export const BacktestSettingsSchema = z.object({
  /** Starting account equity in quote currency. */
  initialCapital: z.coerce.number().positive().max(1e12).default(10_000),
  /** Per-side commission in basis points (5 = 0.05%). */
  feeBps: z.coerce.number().min(0).max(1000).default(5),
  /** Per-side slippage in basis points. */
  slippageBps: z.coerce.number().min(0).max(1000).default(2),
  /** Allow short positions (otherwise a bearish signal just flattens). */
  allowShort: z.coerce.boolean().default(false),
  /** Fraction of equity committed per position, in (0, 1]. */
  positionPct: z.coerce.number().positive().max(1).default(1),
});
export type BacktestSettings = z.infer<typeof BacktestSettingsSchema>;

/** A single round-trip trade. */
export interface BacktestTrade {
  readonly side: 'long' | 'short';
  readonly entryIndex: number;
  readonly entryTime: number;
  readonly entryPrice: number;
  readonly exitIndex: number;
  readonly exitTime: number;
  readonly exitPrice: number;
  readonly qty: number;
  /** Net profit in quote currency after entry + exit fees. */
  readonly pnl: number;
  /** Net return on the position's notional, e.g. 0.05 = +5%. */
  readonly pnlPct: number;
  readonly barsHeld: number;
  readonly exitReason: 'signal' | 'end';
}

export interface EquityPoint {
  readonly time: number;
  readonly equity: number;
}

export interface BacktestStats {
  readonly initialCapital: number;
  readonly finalEquity: number;
  readonly netProfit: number;
  readonly netProfitPct: number;
  readonly buyHoldReturnPct: number;
  readonly totalTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly winRate: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  /** grossProfit / grossLoss; null when there were no losing trades. */
  readonly profitFactor: number | null;
  readonly avgTrade: number;
  readonly avgWin: number;
  readonly avgLoss: number;
  readonly largestWin: number;
  readonly largestLoss: number;
  readonly maxDrawdown: number;
  readonly maxDrawdownPct: number;
  readonly longTrades: number;
  readonly shortTrades: number;
  readonly avgBarsHeld: number;
  /** Fraction of bars spent in a position, in [0, 1]. */
  readonly exposurePct: number;
  /** Per-bar Sharpe ratio of the equity curve (mean / stddev of bar returns). */
  readonly sharpe: number;
}

export interface BacktestResult {
  /** Present for built-in strategies ({@link runBacktest}); absent for raw
   * signal simulations ({@link simulate}, e.g. a Pine signal series). */
  readonly strategy?: StrategyConfig;
  readonly settings: BacktestSettings;
  readonly barCount: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly trades: readonly BacktestTrade[];
  readonly equityCurve: readonly EquityPoint[];
  readonly stats: BacktestStats;
}

export const BacktestTradeSchema = z.object({
  side: z.enum(['long', 'short']),
  entryIndex: z.number().int(),
  entryTime: z.number().int().nonnegative(),
  entryPrice: z.number().finite(),
  exitIndex: z.number().int(),
  exitTime: z.number().int().nonnegative(),
  exitPrice: z.number().finite(),
  qty: z.number().finite(),
  pnl: z.number().finite(),
  pnlPct: z.number().finite(),
  barsHeld: z.number().int().nonnegative(),
  exitReason: z.enum(['signal', 'end']),
});

export const BacktestStatsSchema = z.object({
  initialCapital: z.number().finite(),
  finalEquity: z.number().finite(),
  netProfit: z.number().finite(),
  netProfitPct: z.number().finite(),
  buyHoldReturnPct: z.number().finite(),
  totalTrades: z.number().int().nonnegative(),
  winningTrades: z.number().int().nonnegative(),
  losingTrades: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  grossProfit: z.number().finite(),
  grossLoss: z.number().finite(),
  profitFactor: z.number().finite().nullable(),
  avgTrade: z.number().finite(),
  avgWin: z.number().finite(),
  avgLoss: z.number().finite(),
  largestWin: z.number().finite(),
  largestLoss: z.number().finite(),
  maxDrawdown: z.number().finite(),
  maxDrawdownPct: z.number().finite(),
  longTrades: z.number().int().nonnegative(),
  shortTrades: z.number().int().nonnegative(),
  avgBarsHeld: z.number().finite(),
  exposurePct: z.number().min(0).max(1),
  sharpe: z.number().finite(),
});

export const BacktestResultSchema = z.object({
  strategy: StrategyConfigSchema.optional(),
  settings: BacktestSettingsSchema,
  barCount: z.number().int().nonnegative(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  trades: z.array(BacktestTradeSchema),
  equityCurve: z.array(z.object({ time: z.number().int().nonnegative(), equity: z.number().finite() })),
  stats: BacktestStatsSchema,
});

/** Metric an optimization run ranks parameter combinations by. */
export const OptimizeObjectiveSchema = z.enum([
  'netProfitPct',
  'sharpe',
  'profitFactor',
  'winRate',
  'maxDrawdownPct',
]);
export type OptimizeObjective = z.infer<typeof OptimizeObjectiveSchema>;

export interface OptimizeResultRow {
  readonly params: Record<string, number>;
  readonly stats: BacktestStats;
}

export interface OptimizeResult {
  readonly type: StrategyType;
  readonly objective: OptimizeObjective;
  /** Number of parameter combinations actually evaluated. */
  readonly evaluated: number;
  /** True when the grid exceeded `maxCombos` and was capped. */
  readonly truncated: boolean;
  /** Rows ranked best-first by the objective; at most `topN`. */
  readonly results: readonly OptimizeResultRow[];
}

export const OptimizeResultSchema = z.object({
  type: StrategyTypeSchema,
  objective: OptimizeObjectiveSchema,
  evaluated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  results: z.array(
    z.object({ params: z.record(z.string(), z.number()), stats: BacktestStatsSchema }),
  ),
});

/** One walk-forward fold: optimize on the in-sample window, test out-of-sample. */
export interface WalkForwardFold {
  readonly inStart: number;
  readonly inEnd: number;
  readonly outStart: number;
  readonly outEnd: number;
  readonly bestParams: Record<string, number>;
  /** Objective score of the best params on the in-sample window. */
  readonly inSampleScore: number;
  /** Objective score of those params on the out-of-sample window. */
  readonly oosScore: number;
  readonly oos: BacktestStats;
}

export interface WalkForwardAggregate {
  readonly foldCount: number;
  readonly profitableFolds: number;
  readonly profitableFoldPct: number;
  /** Compounded out-of-sample return across folds: Π(1 + oosᵢ) − 1. */
  readonly oosReturnCompounded: number;
  readonly avgOosReturn: number;
  readonly avgInSampleScore: number;
  readonly avgOosScore: number;
  /** avgOosScore / avgInSampleScore — how well the optimization generalizes. */
  readonly walkForwardEfficiency: number;
  readonly totalOosTrades: number;
}

export interface WalkForwardResult {
  readonly type: StrategyType;
  readonly objective: OptimizeObjective;
  readonly inSampleBars: number;
  readonly outOfSampleBars: number;
  readonly folds: readonly WalkForwardFold[];
  readonly aggregate: WalkForwardAggregate;
}

export const WalkForwardResultSchema = z.object({
  type: StrategyTypeSchema,
  objective: OptimizeObjectiveSchema,
  inSampleBars: z.number().int().positive(),
  outOfSampleBars: z.number().int().positive(),
  folds: z.array(
    z.object({
      inStart: z.number().int().nonnegative(),
      inEnd: z.number().int().nonnegative(),
      outStart: z.number().int().nonnegative(),
      outEnd: z.number().int().nonnegative(),
      bestParams: z.record(z.string(), z.number()),
      inSampleScore: z.number().finite(),
      oosScore: z.number().finite(),
      oos: BacktestStatsSchema,
    }),
  ),
  aggregate: z.object({
    foldCount: z.number().int().nonnegative(),
    profitableFolds: z.number().int().nonnegative(),
    profitableFoldPct: z.number().finite(),
    oosReturnCompounded: z.number().finite(),
    avgOosReturn: z.number().finite(),
    avgInSampleScore: z.number().finite(),
    avgOosScore: z.number().finite(),
    walkForwardEfficiency: z.number().finite(),
    totalOosTrades: z.number().int().nonnegative(),
  }),
});

/** Catalog entry describing a strategy and its tunable parameters. */
export interface StrategyParamDef {
  readonly key: string;
  readonly label: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
export interface StrategyDef {
  readonly type: StrategyType;
  readonly label: string;
  readonly description: string;
  readonly params: readonly StrategyParamDef[];
}
