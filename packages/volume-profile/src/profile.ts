import type { Bar } from '@tv/data-types';
import type { VolumeProfile, VolumeProfileOptions, VolumeProfileRow } from './types.js';
import { buyFraction, clamp, overlap } from './helpers.js';

/** Bin index for `price`, clamped into `[0, bins - 1]`. */
const binIndex = (price: number, low: number, size: number, bins: number): number => {
  if (size <= 0) return 0;
  return clamp(Math.floor((price - low) / size), 0, bins - 1);
};

const emptyProfile = (): VolumeProfile => ({
  bins: 0,
  binSize: 0,
  priceLow: 0,
  priceHigh: 0,
  barCount: 0,
  startTime: 0,
  endTime: 0,
  totalVolume: 0,
  buyVolume: 0,
  sellVolume: 0,
  delta: 0,
  poc: 0,
  pocIndex: -1,
  vah: 0,
  val: 0,
  valueAreaVolume: 0,
  valueAreaPct: 0,
  rows: [],
});

/**
 * Compute a volume-at-price distribution over `bars`. The price range
 * `[min low, max high]` is split into `bins` horizontal rows; each bar's
 * volume is spread across the rows its `[low, high]` range overlaps,
 * proportional to the overlap, and split into a buy/sell estimate from where
 * the bar closed (see {@link buyFraction}). The Point of Control (POC) is the
 * highest-volume row; the value area is the contiguous band of rows around
 * the POC holding `valueAreaPct` of total volume, grown one row at a time
 * toward whichever neighbour carries more volume.
 *
 * Pure and deterministic — a function of the bars and options only.
 */
export const computeVolumeProfile = (
  bars: ReadonlyArray<Bar>,
  opts: VolumeProfileOptions = {},
): VolumeProfile => {
  const reqBins = Math.max(1, Math.floor(opts.bins ?? 24));
  const vaTarget = clamp(opts.valueAreaPct ?? 0.7, 0.01, 1);

  if (bars.length === 0) return emptyProfile();

  let priceLow = Infinity;
  let priceHigh = -Infinity;
  let startTime = bars[0]!.time;
  let endTime = bars[0]!.time;
  for (const bar of bars) {
    if (bar.low < priceLow) priceLow = bar.low;
    if (bar.high > priceHigh) priceHigh = bar.high;
    if (bar.time < startTime) startTime = bar.time;
    if (bar.time > endTime) endTime = bar.time;
  }

  const degenerate = priceHigh <= priceLow;
  const bins = degenerate ? 1 : reqBins;
  const binSize = degenerate ? 0 : (priceHigh - priceLow) / bins;

  const buy = new Array<number>(bins).fill(0);
  const sell = new Array<number>(bins).fill(0);

  for (const bar of bars) {
    if (bar.volume <= 0) continue;
    const bf = buyFraction(bar);
    const sf = 1 - bf;

    if (degenerate || bar.high <= bar.low) {
      const idx = degenerate ? 0 : binIndex(bar.close, priceLow, binSize, bins);
      buy[idx]! += bar.volume * bf;
      sell[idx]! += bar.volume * sf;
      continue;
    }

    const range = bar.high - bar.low;
    const first = binIndex(bar.low, priceLow, binSize, bins);
    const last = binIndex(bar.high, priceLow, binSize, bins);
    for (let i = first; i <= last; i++) {
      const binLo = priceLow + i * binSize;
      const binHi = binLo + binSize;
      const ov = overlap(bar.low, bar.high, binLo, binHi);
      if (ov <= 0) continue;
      const share = (bar.volume * ov) / range;
      buy[i]! += share * bf;
      sell[i]! += share * sf;
    }
  }

  let totalVolume = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let pocIndex = 0;
  let pocVol = -1;
  for (let i = 0; i < bins; i++) {
    const v = buy[i]! + sell[i]!;
    totalVolume += v;
    buyVolume += buy[i]!;
    sellVolume += sell[i]!;
    if (v > pocVol) {
      pocVol = v;
      pocIndex = i;
    }
  }

  // Grow the value area outward from the POC, always toward the heavier
  // neighbour, until it holds `vaTarget` of total volume (ties expand up).
  let lo = pocIndex;
  let hi = pocIndex;
  let vaVol = buy[pocIndex]! + sell[pocIndex]!;
  const target = totalVolume * vaTarget;
  while (vaVol < target && (lo > 0 || hi < bins - 1)) {
    const downVol = lo > 0 ? buy[lo - 1]! + sell[lo - 1]! : -Infinity;
    const upVol = hi < bins - 1 ? buy[hi + 1]! + sell[hi + 1]! : -Infinity;
    if (upVol >= downVol) {
      hi += 1;
      vaVol += buy[hi]! + sell[hi]!;
    } else {
      lo -= 1;
      vaVol += buy[lo]! + sell[lo]!;
    }
  }

  const rows: VolumeProfileRow[] = [];
  for (let i = 0; i < bins; i++) {
    const binLo = i === 0 ? priceLow : priceLow + i * binSize;
    const binHi = i === bins - 1 ? priceHigh : priceLow + (i + 1) * binSize;
    rows.push({
      index: i,
      priceLow: binLo,
      priceHigh: binHi,
      priceMid: (binLo + binHi) / 2,
      volume: buy[i]! + sell[i]!,
      buyVolume: buy[i]!,
      sellVolume: sell[i]!,
      delta: buy[i]! - sell[i]!,
      isPoc: i === pocIndex,
      inValueArea: i >= lo && i <= hi,
    });
  }

  return {
    bins,
    binSize,
    priceLow,
    priceHigh,
    barCount: bars.length,
    startTime,
    endTime,
    totalVolume,
    buyVolume,
    sellVolume,
    delta: buyVolume - sellVolume,
    poc: rows[pocIndex]!.priceMid,
    pocIndex,
    vah: rows[hi]!.priceHigh,
    val: rows[lo]!.priceLow,
    valueAreaVolume: vaVol,
    valueAreaPct: totalVolume > 0 ? vaVol / totalVolume : 0,
    rows,
  };
};
