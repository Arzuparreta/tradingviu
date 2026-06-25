import type { Bar } from '@tv/data-types';
import type { ChartPatternPoint, Pivot } from './types.js';

/** Two price levels are equal within `tol` (a fraction of their magnitude). */
export const withinTol = (a: number, b: number, tol: number): boolean => {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= scale * tol;
};

/** How equal two levels are, in [0, 1]: 1 when identical, 0 at the tolerance edge. */
export const equality = (a: number, b: number, tol: number): number => {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  const diff = Math.abs(a - b) / (scale * tol);
  return clamp01(1 - diff);
};

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Slope of the line through two pivots, in price per bar. */
export const slope = (a: Pivot, b: Pivot): number =>
  a.index === b.index ? 0 : (b.price - a.price) / (b.index - a.index);

/** Value of the line through two pivots, projected to bar index `x`. */
export const lineAt = (a: Pivot, b: Pivot, x: number): number =>
  a.index === b.index ? a.price : a.price + slope(a, b) * (x - a.index);

/** Direction of the move from `a` to `b`, treating near-equal levels as flat. */
export const trendOf = (a: Pivot, b: Pivot, tol: number): 'up' | 'down' | 'flat' => {
  if (withinTol(a.price, b.price, tol)) return 'flat';
  return b.price > a.price ? 'up' : 'down';
};

/**
 * First bar after `from` (within `within` bars) whose close drops below the
 * trendline level returned by `levelAt`. Returns -1 if none.
 */
export const breakoutBelow = (
  bars: ReadonlyArray<Bar>,
  from: number,
  levelAt: (j: number) => number,
  within: number,
): number => {
  const end = Math.min(bars.length, from + 1 + within);
  for (let j = from + 1; j < end; j++) {
    const b = bars[j];
    if (b && b.close < levelAt(j)) return j;
  }
  return -1;
};

/** First bar after `from` (within `within` bars) whose close rises above `levelAt`. */
export const breakoutAbove = (
  bars: ReadonlyArray<Bar>,
  from: number,
  levelAt: (j: number) => number,
  within: number,
): number => {
  const end = Math.min(bars.length, from + 1 + within);
  for (let j = from + 1; j < end; j++) {
    const b = bars[j];
    if (b && b.close > levelAt(j)) return j;
  }
  return -1;
};

export const pivotPoint = (p: Pivot, role: string): ChartPatternPoint => ({
  index: p.index,
  time: p.time,
  price: p.price,
  role,
});

export const barPoint = (bars: ReadonlyArray<Bar>, j: number, role: string): ChartPatternPoint => {
  const b = bars[j];
  return { index: j, time: b ? b.time : 0, price: b ? b.close : 0, role };
};
