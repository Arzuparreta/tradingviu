import { z } from 'zod';

/**
 * One horizontal price row of a TPO (Time Price Opportunity) profile: the set
 * of time periods whose range traded through `[priceLow, priceHigh)`. Unlike a
 * volume profile (which distributes traded *volume*), a TPO profile counts how
 * many distinct time periods printed at each price — the classic Market Profile
 * letter ladder, where each period is a letter (A, B, C, …).
 */
export interface TpoProfileRow {
  /** Row index, 0 = lowest price row, `bins - 1` = highest. */
  readonly index: number;
  readonly priceLow: number;
  readonly priceHigh: number;
  /** Midpoint of the row — the level used when drawing it. */
  readonly priceMid: number;
  /** Number of periods (TPOs) that traded through this row. */
  readonly count: number;
  /** Letters of the periods that printed here, in chronological order. */
  readonly letters: string;
  /** True for the single Point-of-Control row (most TPOs). */
  readonly isPoc: boolean;
  /** True when the row falls inside the value area. */
  readonly inValueArea: boolean;
  /** True when exactly one period printed here (a "single print"). */
  readonly isSinglePrint: boolean;
}

/**
 * A Time-Price-Opportunity (Market Profile) distribution computed over a window
 * of OHLCV bars. Bars are grouped into equal-size periods (`barsPerPeriod` bars
 * each); every period prints its letter at every price row its range spans.
 * Pure and deterministic: a function of the bar array and the bin / value-area /
 * period settings only — no time, randomness, or I/O.
 */
export interface TpoProfile {
  readonly bins: number;
  readonly binSize: number;
  readonly priceLow: number;
  readonly priceHigh: number;
  readonly barCount: number;
  /** Number of TPO periods (letters) the bars were grouped into. */
  readonly periodCount: number;
  readonly startTime: number;
  readonly endTime: number;
  /** Total TPO marks across all rows (sum of row counts). */
  readonly totalTpo: number;
  /** Point of Control: price (row midpoint) printed by the most periods. */
  readonly poc: number;
  readonly pocIndex: number;
  /** Value Area High: top of the value-area price range. */
  readonly vah: number;
  /** Value Area Low: bottom of the value-area price range. */
  readonly val: number;
  /** TPO marks contained in the value area. */
  readonly valueAreaTpo: number;
  /** Fraction of total TPOs actually inside the value area, in [0, 1]. */
  readonly valueAreaPct: number;
  /** Initial Balance high: top of the first one or two periods' range. */
  readonly initialBalanceHigh: number;
  /** Initial Balance low: bottom of the first one or two periods' range. */
  readonly initialBalanceLow: number;
  /** Number of rows touched by exactly one period (single prints). */
  readonly singlePrintCount: number;
  /** Rows ordered low → high price. */
  readonly rows: readonly TpoProfileRow[];
}

export const TpoProfileRowSchema = z.object({
  index: z.number().int().nonnegative(),
  priceLow: z.number().finite(),
  priceHigh: z.number().finite(),
  priceMid: z.number().finite(),
  count: z.number().int().nonnegative(),
  letters: z.string(),
  isPoc: z.boolean(),
  inValueArea: z.boolean(),
  isSinglePrint: z.boolean(),
});

export const TpoProfileSchema = z.object({
  bins: z.number().int().nonnegative(),
  binSize: z.number().nonnegative(),
  priceLow: z.number().finite(),
  priceHigh: z.number().finite(),
  barCount: z.number().int().nonnegative(),
  periodCount: z.number().int().nonnegative(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  totalTpo: z.number().int().nonnegative(),
  poc: z.number().finite(),
  pocIndex: z.number().int(),
  vah: z.number().finite(),
  val: z.number().finite(),
  valueAreaTpo: z.number().int().nonnegative(),
  valueAreaPct: z.number().min(0).max(1),
  initialBalanceHigh: z.number().finite(),
  initialBalanceLow: z.number().finite(),
  singlePrintCount: z.number().int().nonnegative(),
  rows: z.array(TpoProfileRowSchema),
});

/** Tuning for {@link computeTpoProfile}. */
export interface TpoProfileOptions {
  /** Number of price rows (default 24). */
  readonly bins?: number;
  /** Target value-area fraction in (0, 1] (default 0.7). */
  readonly valueAreaPct?: number;
  /** Consecutive bars merged into one TPO period / letter (default 1). */
  readonly barsPerPeriod?: number;
}
