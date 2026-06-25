import type { Bar } from '@tv/data-types';
import {
  body,
  bodyTop,
  bodyBottom,
  bodyMid,
  isBull,
  isBear,
  nearlyEqual,
  priorTrend,
} from './helpers.js';

/** Returns the (prev, curr) pair completing at index `i`, or undefined. */
const pair = (bars: ReadonlyArray<Bar>, i: number): readonly [Bar, Bar] | undefined => {
  const prev = bars[i - 1];
  const curr = bars[i];
  if (!prev || !curr) return undefined;
  return [prev, curr];
};

/** Bullish engulfing: down bar then an up bar whose body engulfs it. */
export const bullishEngulfing = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBear(prev) || !isBull(curr)) return false;
  if (!(curr.open <= prev.close && curr.close >= prev.open)) return false;
  return priorTrend(bars, i - 1) === 'down';
};

/** Bearish engulfing: up bar then a down bar whose body engulfs it. */
export const bearishEngulfing = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBull(prev) || !isBear(curr)) return false;
  if (!(curr.open >= prev.close && curr.close <= prev.open)) return false;
  return priorTrend(bars, i - 1) === 'up';
};

/** A small second body fully contained within a large first body. */
const isHarami = (prev: Bar, curr: Bar): boolean => {
  if (body(curr) >= body(prev)) return false;
  return bodyTop(curr) <= bodyTop(prev) && bodyBottom(curr) >= bodyBottom(prev);
};

/** Bullish harami: large down bar, then a small up bar inside it. */
export const bullishHarami = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBear(prev) || !isBull(curr)) return false;
  if (!isHarami(prev, curr)) return false;
  return priorTrend(bars, i - 1) === 'down';
};

/** Bearish harami: large up bar, then a small down bar inside it. */
export const bearishHarami = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBull(prev) || !isBear(curr)) return false;
  if (!isHarami(prev, curr)) return false;
  return priorTrend(bars, i - 1) === 'up';
};

/**
 * Piercing line: down bar, then an up bar that opens below the prior low and
 * closes back above the midpoint of the prior body (but not above its open).
 */
export const piercingLine = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBear(prev) || !isBull(curr)) return false;
  if (!(curr.open < prev.low)) return false;
  return curr.close > bodyMid(prev) && curr.close < prev.open;
};

/**
 * Dark cloud cover: up bar, then a down bar that opens above the prior high and
 * closes back below the midpoint of the prior body (but not below its open).
 */
export const darkCloudCover = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBull(prev) || !isBear(curr)) return false;
  if (!(curr.open > prev.high)) return false;
  return curr.close < bodyMid(prev) && curr.close > prev.open;
};

/** Tweezer bottom: two bars sharing nearly the same low after a downtrend. */
export const tweezerBottom = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBear(prev) || !isBull(curr)) return false;
  if (!nearlyEqual(prev.low, curr.low)) return false;
  return priorTrend(bars, i - 1) === 'down';
};

/** Tweezer top: two bars sharing nearly the same high after an uptrend. */
export const tweezerTop = (bars: ReadonlyArray<Bar>, i: number): boolean => {
  const p = pair(bars, i);
  if (!p) return false;
  const [prev, curr] = p;
  if (!isBull(prev) || !isBear(curr)) return false;
  if (!nearlyEqual(prev.high, curr.high)) return false;
  return priorTrend(bars, i - 1) === 'up';
};
