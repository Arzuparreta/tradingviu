import { z } from 'zod';

/** A single plotted point of an Ichimoku line, in chart time/price units. */
export interface IchimokuLinePoint {
  /** UTC seconds. Senkou spans use *future* times (displaced forward); Chikou
   * uses *past* times (displaced back). */
  readonly time: number;
  readonly value: number;
}

/**
 * One aligned column of the cloud (kumo): both leading spans at the same
 * (displaced) future time, plus which span is on top. The fill is green when
 * `bullish` (Span A ≥ Span B) and red otherwise.
 */
export interface IchimokuCloudPoint {
  readonly time: number;
  readonly spanA: number;
  readonly spanB: number;
  readonly bullish: boolean;
}

/**
 * Ichimoku Kinkō Hyō, computed over a window of OHLCV bars. Pure and
 * deterministic — a function of the bars and the period settings only.
 *
 * - **Tenkan-sen** (conversion): midpoint of the last `tenkan` highs/lows.
 * - **Kijun-sen** (base): midpoint of the last `kijun` highs/lows.
 * - **Senkou Span A** (leading A): `(Tenkan + Kijun) / 2`, plotted
 *   `displacement` bars ahead.
 * - **Senkou Span B** (leading B): midpoint of the last `senkou` highs/lows,
 *   plotted `displacement` bars ahead.
 * - **Chikou Span** (lagging): the close, plotted `displacement` bars behind.
 */
export interface Ichimoku {
  readonly tenkan: readonly IchimokuLinePoint[];
  readonly kijun: readonly IchimokuLinePoint[];
  readonly senkouA: readonly IchimokuLinePoint[];
  readonly senkouB: readonly IchimokuLinePoint[];
  readonly chikou: readonly IchimokuLinePoint[];
  /** Span A / Span B aligned over the (future) cloud times, low → high time. */
  readonly cloud: readonly IchimokuCloudPoint[];
  readonly params: {
    readonly tenkan: number;
    readonly kijun: number;
    readonly senkou: number;
    readonly displacement: number;
  };
}

export const IchimokuLinePointSchema = z.object({
  time: z.number().int().nonnegative(),
  value: z.number().finite(),
});

export const IchimokuCloudPointSchema = z.object({
  time: z.number().int().nonnegative(),
  spanA: z.number().finite(),
  spanB: z.number().finite(),
  bullish: z.boolean(),
});

export const IchimokuSchema = z.object({
  tenkan: z.array(IchimokuLinePointSchema),
  kijun: z.array(IchimokuLinePointSchema),
  senkouA: z.array(IchimokuLinePointSchema),
  senkouB: z.array(IchimokuLinePointSchema),
  chikou: z.array(IchimokuLinePointSchema),
  cloud: z.array(IchimokuCloudPointSchema),
  params: z.object({
    tenkan: z.number().int().positive(),
    kijun: z.number().int().positive(),
    senkou: z.number().int().positive(),
    displacement: z.number().int().nonnegative(),
  }),
});

/** Tuning for {@link computeIchimoku}. Defaults are the classic 9 / 26 / 52. */
export interface IchimokuOptions {
  readonly tenkan?: number;
  readonly kijun?: number;
  readonly senkou?: number;
  /** Forward/back shift for the spans (default `kijun`, i.e. 26). */
  readonly displacement?: number;
}
