import type { Bar } from '@tv/data-types';

/** Absolute distance between open and close (the real body). */
export const body = (b: Bar): number => Math.abs(b.close - b.open);

/** High-to-low range. */
export const range = (b: Bar): number => b.high - b.low;

/** Distance from the top of the body to the high. */
export const upperShadow = (b: Bar): number => b.high - Math.max(b.open, b.close);

/** Distance from the bottom of the body to the low. */
export const lowerShadow = (b: Bar): number => Math.min(b.open, b.close) - b.low;

/** Top of the real body (the larger of open/close). */
export const bodyTop = (b: Bar): number => Math.max(b.open, b.close);

/** Bottom of the real body (the smaller of open/close). */
export const bodyBottom = (b: Bar): number => Math.min(b.open, b.close);

/** Midpoint of the real body. */
export const bodyMid = (b: Bar): number => (b.open + b.close) / 2;

export const isBull = (b: Bar): boolean => b.close > b.open;
export const isBear = (b: Bar): boolean => b.close < b.open;

/** Body as a fraction of the total range (0 when the bar has no range). */
export const bodyRatio = (b: Bar): number => {
  const r = range(b);
  return r === 0 ? 0 : body(b) / r;
};

/** Two price levels are equal within `tol` (a fraction of their magnitude). */
export const nearlyEqual = (a: number, b: number, tol = 0.0015): boolean => {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= scale * tol;
};

export type Trend = 'up' | 'down' | 'flat' | 'none';

/**
 * Classify the trend in the `lookback` bars immediately before `startIndex`
 * (the first bar of a pattern). Used to disambiguate shape-identical patterns
 * that mean opposite things by context (e.g. hammer vs hanging man).
 *
 * Compares the regression-free endpoints of the prior window: rising closes
 * over the window read as `up`, falling as `down`. `thresh` is the minimum
 * fractional move required to count as a trend rather than `flat`.
 */
export const priorTrend = (
  bars: ReadonlyArray<Bar>,
  startIndex: number,
  lookback = 3,
  thresh = 0.005,
): Trend => {
  const from = startIndex - lookback;
  if (from < 0) return 'none';
  const first = bars[from];
  const last = bars[startIndex - 1];
  if (!first || !last) return 'none';
  const change = (last.close - first.close) / Math.max(Math.abs(first.close), 1e-9);
  if (change <= -thresh) return 'down';
  if (change >= thresh) return 'up';
  return 'flat';
};
