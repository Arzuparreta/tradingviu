import type { Bar } from '@tv/data-types';
import type { Pivot } from './types.js';

/**
 * Detect swing pivots. A swing high at index `i` is a bar whose high is
 * strictly the largest in the window `[i-lookback, i+lookback]`; a swing low
 * the strictly smallest. Pure function of the bars — no time or I/O.
 *
 * The `lookback` window on both sides means the last `lookback` bars can never
 * be pivots; this is intentional (a swing isn't confirmed until both sides
 * exist), and matches how chart patterns are read in practice.
 */
export const findPivots = (bars: ReadonlyArray<Bar>, lookback = 3): Pivot[] => {
  const out: Pivot[] = [];
  const n = bars.length;
  for (let i = lookback; i < n - lookback; i++) {
    const b = bars[i];
    if (!b) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      const o = bars[j];
      if (!o) continue;
      if (o.high >= b.high) isHigh = false;
      if (o.low <= b.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: b.time, price: b.high, kind: 'high' });
    else if (isLow) out.push({ index: i, time: b.time, price: b.low, kind: 'low' });
  }
  return out;
};

/**
 * Collapse runs of consecutive same-kind pivots, keeping the more extreme one,
 * so the result strictly alternates high/low. Pattern detectors assume an
 * alternating sequence.
 */
export const alternatePivots = (pivots: ReadonlyArray<Pivot>): Pivot[] => {
  const out: Pivot[] = [];
  for (const p of pivots) {
    const last = out[out.length - 1];
    if (!last || last.kind !== p.kind) {
      out.push(p);
      continue;
    }
    const moreExtreme = p.kind === 'high' ? p.price > last.price : p.price < last.price;
    if (moreExtreme) out[out.length - 1] = p;
  }
  return out;
};
