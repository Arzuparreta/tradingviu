import type { Bar } from '@tv/data-types';
import type {
  ChartPatternCatalogEntry,
  ChartPatternDefinition,
  ChartPatternMatch,
} from './types.js';
import { alternatePivots, findPivots } from './pivots.js';
import { reversalPatterns } from './reversals.js';
import { continuationPatterns } from './continuations.js';

export const CHART_PATTERNS: readonly ChartPatternDefinition[] = [
  ...reversalPatterns,
  ...continuationPatterns,
];

const BY_ID = new Map(CHART_PATTERNS.map((p) => [p.id, p]));

export const allChartPatterns = (): readonly ChartPatternCatalogEntry[] =>
  CHART_PATTERNS.map(({ id, name, direction, category, description }) => ({
    id,
    name,
    direction,
    category,
    description,
  }));

export const findChartPattern = (id: string): ChartPatternDefinition | undefined => BY_ID.get(id);

export interface ScanChartPatternsOptions {
  /** Swing-pivot window on each side (default 3). */
  readonly lookback?: number;
  /** Equality tolerance for near-equal levels, as a fraction (default 0.03). */
  readonly priceTol?: number;
  /** Minimum pattern height as a fraction of price (default 0.02). */
  readonly minHeight?: number;
  /** Bars after the last pivot in which a breakout still confirms (default 60). */
  readonly confirmWithin?: number;
  /** Restrict detection to these pattern ids. Unknown ids are ignored. */
  readonly ids?: readonly string[];
}

/**
 * Scan `bars` and return every confirmed chart-pattern match, in breakout
 * order. Pivots are computed once and shared across detectors. Multiple
 * patterns can confirm in the same window (e.g. a double top inside a triple
 * top); each is returned separately.
 */
export const scanChartPatterns = (
  bars: ReadonlyArray<Bar>,
  opts: ScanChartPatternsOptions = {},
): ChartPatternMatch[] => {
  const lookback = opts.lookback ?? 3;
  const priceTol = opts.priceTol ?? 0.03;
  const minHeight = opts.minHeight ?? 0.02;
  const confirmWithin = opts.confirmWithin ?? 60;

  const pivots = alternatePivots(findPivots(bars, lookback));
  const idSet = opts.ids ? new Set(opts.ids) : undefined;
  const defs = idSet ? CHART_PATTERNS.filter((d) => idSet.has(d.id)) : CHART_PATTERNS;

  const ctx = { bars, pivots, priceTol, minHeight, confirmWithin };
  const out = defs.flatMap((d) => d.scan(ctx));
  out.sort((a, b) => a.endIndex - b.endIndex || a.id.localeCompare(b.id));
  return out;
};
