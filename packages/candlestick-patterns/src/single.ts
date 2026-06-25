import type { Bar } from '@tv/data-types';
import {
  body,
  range,
  upperShadow,
  lowerShadow,
  bodyRatio,
  isBull,
  isBear,
  priorTrend,
} from './helpers.js';

/** A doji has a negligible body relative to its range. */
export const isDoji = (b: Bar): boolean => {
  if (range(b) === 0) return false;
  return bodyRatio(b) <= 0.1;
};

/** A marubozu is almost all body with negligible shadows. */
export const isMarubozu = (b: Bar): boolean => {
  if (range(b) === 0) return false;
  return bodyRatio(b) >= 0.9;
};

/**
 * Hammer-shaped: small body near the top, long lower shadow (>= 2x body),
 * short upper shadow. Direction comes from context (see registry).
 */
const isHammerShape = (b: Bar): boolean => {
  const bd = body(b);
  if (bd === 0 || range(b) === 0) return false;
  return lowerShadow(b) >= 2 * bd && upperShadow(b) <= bd;
};

/**
 * Inverted-hammer-shaped: small body near the bottom, long upper shadow
 * (>= 2x body), short lower shadow. Direction comes from context.
 */
const isInvertedHammerShape = (b: Bar): boolean => {
  const bd = body(b);
  if (bd === 0 || range(b) === 0) return false;
  return upperShadow(b) >= 2 * bd && lowerShadow(b) <= bd;
};

const bar = (bars: ReadonlyArray<Bar>, i: number): Bar | undefined => bars[i];

export const doji = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isDoji(b);
};

export const marubozuBull = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isMarubozu(b) && isBull(b);
};

export const marubozuBear = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isMarubozu(b) && isBear(b);
};

/** Small body with long upper and lower shadows — indecision. */
export const spinningTop = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  if (!b || range(b) === 0) return false;
  const bd = body(b);
  if (bodyRatio(b) > 0.3) return false;
  return upperShadow(b) >= bd && lowerShadow(b) >= bd && !isDoji(b);
};

/** Hammer: hammer shape after a downtrend → bullish reversal. */
export const hammer = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isHammerShape(b) && priorTrend(bars, i) === 'down';
};

/** Hanging man: hammer shape after an uptrend → bearish reversal. */
export const hangingMan = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isHammerShape(b) && priorTrend(bars, i) === 'up';
};

/** Inverted hammer: inverted-hammer shape after a downtrend → bullish. */
export const invertedHammer = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isInvertedHammerShape(b) && priorTrend(bars, i) === 'down';
};

/** Shooting star: inverted-hammer shape after an uptrend → bearish. */
export const shootingStar = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const b = bar(bars, i);
  return !!b && isInvertedHammerShape(b) && priorTrend(bars, i) === 'up';
};
