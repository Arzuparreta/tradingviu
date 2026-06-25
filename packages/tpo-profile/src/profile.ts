import type { Bar } from '@tv/data-types';
import type { TpoProfile, TpoProfileOptions, TpoProfileRow } from './types.js';
import { clamp, periodLabel } from './helpers.js';

/** Row index for `price`, clamped into `[0, bins - 1]`. */
const binIndex = (price: number, low: number, size: number, bins: number): number => {
  if (size <= 0) return 0;
  return clamp(Math.floor((price - low) / size), 0, bins - 1);
};

const emptyProfile = (): TpoProfile => ({
  bins: 0,
  binSize: 0,
  priceLow: 0,
  priceHigh: 0,
  barCount: 0,
  periodCount: 0,
  startTime: 0,
  endTime: 0,
  totalTpo: 0,
  poc: 0,
  pocIndex: -1,
  vah: 0,
  val: 0,
  valueAreaTpo: 0,
  valueAreaPct: 0,
  initialBalanceHigh: 0,
  initialBalanceLow: 0,
  singlePrintCount: 0,
  rows: [],
});

/** A TPO period: the merged price range of `barsPerPeriod` consecutive bars. */
interface Period {
  readonly low: number;
  readonly high: number;
}

/** Group consecutive bars into equal-size periods, merging each group's range. */
const buildPeriods = (bars: ReadonlyArray<Bar>, barsPerPeriod: number): Period[] => {
  const periods: Period[] = [];
  for (let i = 0; i < bars.length; i += barsPerPeriod) {
    let low = Infinity;
    let high = -Infinity;
    for (let j = i; j < i + barsPerPeriod && j < bars.length; j++) {
      const b = bars[j]!;
      if (b.low < low) low = b.low;
      if (b.high > high) high = b.high;
    }
    periods.push({ low, high });
  }
  return periods;
};

/**
 * Compute a Time-Price-Opportunity (Market Profile) distribution over `bars`.
 * The price range `[min low, max high]` is split into `bins` horizontal rows;
 * bars are grouped into periods of `barsPerPeriod` bars, and each period prints
 * its letter at every row its merged `[low, high]` range spans. A row's `count`
 * is the number of periods that printed there. The Point of Control (POC) is
 * the highest-count row; the value area is the contiguous band of rows around
 * the POC holding `valueAreaPct` of all TPOs, grown one row at a time toward
 * whichever neighbour carries more TPOs. The Initial Balance is the range of
 * the first one or two periods; single prints are rows with a count of one.
 *
 * Pure and deterministic — a function of the bars and options only.
 */
export const computeTpoProfile = (
  bars: ReadonlyArray<Bar>,
  opts: TpoProfileOptions = {},
): TpoProfile => {
  const reqBins = Math.max(1, Math.floor(opts.bins ?? 24));
  const vaTarget = clamp(opts.valueAreaPct ?? 0.7, 0.01, 1);
  const barsPerPeriod = Math.max(1, Math.floor(opts.barsPerPeriod ?? 1));

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

  const periods = buildPeriods(bars, barsPerPeriod);

  const count = new Array<number>(bins).fill(0);
  const letters: string[] = new Array<string>(bins).fill('');

  periods.forEach((period, p) => {
    const label = periodLabel(p);
    const first = degenerate ? 0 : binIndex(period.low, priceLow, binSize, bins);
    const last = degenerate ? 0 : binIndex(period.high, priceLow, binSize, bins);
    for (let i = first; i <= last; i++) {
      count[i]! += 1;
      letters[i] += label;
    }
  });

  let totalTpo = 0;
  let pocIndex = 0;
  let pocCount = -1;
  let singlePrintCount = 0;
  for (let i = 0; i < bins; i++) {
    const c = count[i]!;
    totalTpo += c;
    if (c === 1) singlePrintCount += 1;
    if (c > pocCount) {
      pocCount = c;
      pocIndex = i;
    }
  }

  // Grow the value area outward from the POC, always toward the heavier
  // neighbour, until it holds `vaTarget` of all TPOs (ties expand up).
  let lo = pocIndex;
  let hi = pocIndex;
  let vaTpo = count[pocIndex]!;
  const target = totalTpo * vaTarget;
  while (vaTpo < target && (lo > 0 || hi < bins - 1)) {
    const downTpo = lo > 0 ? count[lo - 1]! : -Infinity;
    const upTpo = hi < bins - 1 ? count[hi + 1]! : -Infinity;
    if (upTpo >= downTpo) {
      hi += 1;
      vaTpo += count[hi]!;
    } else {
      lo -= 1;
      vaTpo += count[lo]!;
    }
  }

  const rows: TpoProfileRow[] = [];
  for (let i = 0; i < bins; i++) {
    const binLo = i === 0 ? priceLow : priceLow + i * binSize;
    const binHi = i === bins - 1 ? priceHigh : priceLow + (i + 1) * binSize;
    rows.push({
      index: i,
      priceLow: binLo,
      priceHigh: binHi,
      priceMid: (binLo + binHi) / 2,
      count: count[i]!,
      letters: letters[i]!,
      isPoc: i === pocIndex,
      inValueArea: i >= lo && i <= hi,
      isSinglePrint: count[i]! === 1,
    });
  }

  // Initial Balance: the price range of the first one or two periods.
  const ibPeriods = periods.slice(0, Math.min(2, periods.length));
  let initialBalanceLow = Infinity;
  let initialBalanceHigh = -Infinity;
  for (const period of ibPeriods) {
    if (period.low < initialBalanceLow) initialBalanceLow = period.low;
    if (period.high > initialBalanceHigh) initialBalanceHigh = period.high;
  }

  return {
    bins,
    binSize,
    priceLow,
    priceHigh,
    barCount: bars.length,
    periodCount: periods.length,
    startTime,
    endTime,
    totalTpo,
    poc: rows[pocIndex]!.priceMid,
    pocIndex,
    vah: rows[hi]!.priceHigh,
    val: rows[lo]!.priceLow,
    valueAreaTpo: vaTpo,
    valueAreaPct: totalTpo > 0 ? vaTpo / totalTpo : 0,
    initialBalanceHigh,
    initialBalanceLow,
    singlePrintCount,
    rows,
  };
};
