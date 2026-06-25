import type { Bar } from '@tv/data-types';
import {
  body,
  bodyTop,
  bodyBottom,
  bodyMid,
  bodyRatio,
  isBull,
  isBear,
  priorTrend,
} from './helpers.js';

/** Returns the (a, b, c) triple completing at index `i`, or undefined. */
const triple = (bars: ReadonlyArray<Bar>, i: number): readonly [Bar, Bar, Bar] | undefined => {
  const a = bars[i - 2];
  const b = bars[i - 1];
  const c = bars[i];
  if (!a || !b || !c) return undefined;
  return [a, b, c];
};

const isSmallBody = (b: Bar): boolean => bodyRatio(b) <= 0.4;

/**
 * Morning star: large down bar, a small-bodied "star" trading below the first
 * body's midpoint, then a strong up bar closing back above that midpoint.
 */
export const morningStar = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!isBear(a) || !isBull(c)) return false;
  if (!isSmallBody(b) || body(b) >= body(a)) return false;
  if (!(bodyTop(b) < bodyMid(a))) return false;
  if (!(c.close > bodyMid(a))) return false;
  return priorTrend(bars, i - 2) === 'down';
};

/**
 * Evening star: large up bar, a small-bodied "star" trading above the first
 * body's midpoint, then a strong down bar closing back below that midpoint.
 */
export const eveningStar = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!isBull(a) || !isBear(c)) return false;
  if (!isSmallBody(b) || body(b) >= body(a)) return false;
  if (!(bodyBottom(b) > bodyMid(a))) return false;
  if (!(c.close < bodyMid(a))) return false;
  return priorTrend(bars, i - 2) === 'up';
};

/**
 * Three white soldiers: three rising up bars, each opening within the prior
 * body and closing at a new high, with contained upper shadows.
 */
export const threeWhiteSoldiers = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!(isBull(a) && isBull(b) && isBull(c))) return false;
  if (!(b.close > a.close && c.close > b.close)) return false;
  if (!(b.open > a.open && b.open <= a.close)) return false;
  if (!(c.open > b.open && c.open <= b.close)) return false;
  return priorTrend(bars, i - 2) !== 'up';
};

/**
 * Three black crows: three falling down bars, each opening within the prior
 * body and closing at a new low.
 */
export const threeBlackCrows = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!(isBear(a) && isBear(b) && isBear(c))) return false;
  if (!(b.close < a.close && c.close < b.close)) return false;
  if (!(b.open < a.open && b.open >= a.close)) return false;
  if (!(c.open < b.open && c.open >= b.close)) return false;
  return priorTrend(bars, i - 2) !== 'down';
};

/**
 * Three inside up: bearish bar, a bullish harami inside it, then a bullish bar
 * closing above the first bar's open — confirmed bottom reversal.
 */
export const threeInsideUp = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!isBear(a) || !isBull(b) || !isBull(c)) return false;
  if (body(b) >= body(a)) return false;
  if (!(bodyTop(b) <= bodyTop(a) && bodyBottom(b) >= bodyBottom(a))) return false;
  if (!(c.close > a.open)) return false;
  return priorTrend(bars, i - 2) === 'down';
};

/**
 * Three inside down: bullish bar, a bearish harami inside it, then a bearish
 * bar closing below the first bar's open — confirmed top reversal.
 */
export const threeInsideDown = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const t = triple(bars, i);
  if (!t) return false;
  const [a, b, c] = t;
  if (!isBull(a) || !isBear(b) || !isBear(c)) return false;
  if (body(b) >= body(a)) return false;
  if (!(bodyTop(b) <= bodyTop(a) && bodyBottom(b) >= bodyBottom(a))) return false;
  if (!(c.close < a.open)) return false;
  return priorTrend(bars, i - 2) === 'up';
};
