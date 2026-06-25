import type { Bar } from '@tv/data-types';

/** Clamp `x` into the inclusive range `[lo, hi]`. */
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * Fraction of a bar's volume attributed to buyers, estimated from where the
 * bar closed inside its own range — the standard proxy used when only OHLCV
 * is available (no bid/ask tape). A close at the high → all buying; at the
 * low → all selling; a flat bar leans on open→close direction. Always [0, 1].
 */
export const buyFraction = (bar: Bar): number => {
  const range = bar.high - bar.low;
  if (range <= 0) return bar.close >= bar.open ? 1 : 0;
  return clamp((bar.close - bar.low) / range, 0, 1);
};

/**
 * Overlap length between `[aLo, aHi]` and `[bLo, bHi]`, never negative.
 * Used to split a bar's volume across the price bins its range spans.
 */
export const overlap = (aLo: number, aHi: number, bLo: number, bHi: number): number => {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  return hi > lo ? hi - lo : 0;
};
