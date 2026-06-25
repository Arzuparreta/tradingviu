import { z } from 'zod';

/**
 * One horizontal price bin of a volume profile: the share of traded volume
 * that occurred while price sat inside `[priceLow, priceHigh)`. Volume is
 * split into a buy/sell estimate from where each contributing bar closed
 * inside its own range (no tick data required), so `delta = buy - sell`.
 */
export interface VolumeProfileRow {
  /** Bin index, 0 = lowest price bin, `bins - 1` = highest. */
  readonly index: number;
  readonly priceLow: number;
  readonly priceHigh: number;
  /** Midpoint of the bin — the level used when drawing the row. */
  readonly priceMid: number;
  readonly volume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  /** `buyVolume - sellVolume`. */
  readonly delta: number;
  /** True for the single Point-of-Control bin (highest volume). */
  readonly isPoc: boolean;
  /** True when the bin falls inside the value area. */
  readonly inValueArea: boolean;
}

/**
 * A volume-at-price distribution computed over a window of OHLCV bars.
 * Pure and deterministic: a function of the bar array and the bin/value-area
 * settings only — no time, randomness, or I/O.
 */
export interface VolumeProfile {
  readonly bins: number;
  readonly binSize: number;
  readonly priceLow: number;
  readonly priceHigh: number;
  readonly barCount: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly totalVolume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly delta: number;
  /** Point of Control: price (bin midpoint) with the most volume. */
  readonly poc: number;
  readonly pocIndex: number;
  /** Value Area High: top of the value-area price range. */
  readonly vah: number;
  /** Value Area Low: bottom of the value-area price range. */
  readonly val: number;
  /** Volume contained in the value area. */
  readonly valueAreaVolume: number;
  /** Fraction of total volume actually inside the value area, in [0, 1]. */
  readonly valueAreaPct: number;
  /** Rows ordered low → high price. */
  readonly rows: readonly VolumeProfileRow[];
}

export const VolumeProfileRowSchema = z.object({
  index: z.number().int().nonnegative(),
  priceLow: z.number().finite(),
  priceHigh: z.number().finite(),
  priceMid: z.number().finite(),
  volume: z.number().nonnegative(),
  buyVolume: z.number().nonnegative(),
  sellVolume: z.number().nonnegative(),
  delta: z.number().finite(),
  isPoc: z.boolean(),
  inValueArea: z.boolean(),
});

export const VolumeProfileSchema = z.object({
  bins: z.number().int().nonnegative(),
  binSize: z.number().nonnegative(),
  priceLow: z.number().finite(),
  priceHigh: z.number().finite(),
  barCount: z.number().int().nonnegative(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  totalVolume: z.number().nonnegative(),
  buyVolume: z.number().nonnegative(),
  sellVolume: z.number().nonnegative(),
  delta: z.number().finite(),
  poc: z.number().finite(),
  pocIndex: z.number().int(),
  vah: z.number().finite(),
  val: z.number().finite(),
  valueAreaVolume: z.number().nonnegative(),
  valueAreaPct: z.number().min(0).max(1),
  rows: z.array(VolumeProfileRowSchema),
});

/** Tuning for {@link computeVolumeProfile}. */
export interface VolumeProfileOptions {
  /** Number of price bins (default 24). */
  readonly bins?: number;
  /** Target value-area fraction in (0, 1] (default 0.7). */
  readonly valueAreaPct?: number;
}
