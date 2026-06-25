import { z } from 'zod';
import type { Bar } from '@tv/data-types';

export type ChartPatternDirection = 'bullish' | 'bearish' | 'neutral';
export type ChartPatternCategory = 'reversal' | 'continuation';
export type PivotKind = 'high' | 'low';

/** A swing pivot: a local extreme in the bar series. */
export interface Pivot {
  readonly index: number;
  readonly time: number;
  readonly price: number;
  readonly kind: PivotKind;
}

/** A structural point of a matched pattern (a pivot or the breakout bar). */
export interface ChartPatternPoint {
  readonly index: number;
  readonly time: number;
  readonly price: number;
  /** e.g. 'left-shoulder', 'head', 'top-1', 'neckline', 'breakout'. */
  readonly role: string;
}

/**
 * A matched chart pattern. Unlike candlestick patterns (fixed-width, single
 * completing bar), chart patterns span a variable window of swing pivots and
 * only fire once price *confirms* them by breaking the relevant trendline.
 * Detection is a pure function of the bar array — fully deterministic.
 */
export interface ChartPatternMatch {
  readonly id: string;
  readonly name: string;
  readonly direction: ChartPatternDirection;
  readonly category: ChartPatternCategory;
  /** Index of the first structural pivot. */
  readonly startIndex: number;
  /** Index of the confirming (breakout) bar. */
  readonly endIndex: number;
  readonly startTime: number;
  readonly endTime: number;
  /** Key points in chronological order (suitable for drawing the shape). */
  readonly points: readonly ChartPatternPoint[];
  /** The trendline level at the breakout bar (the neckline for reversals). */
  readonly breakoutLevel: number;
  /** Measured-move price target projected from the pattern height. */
  readonly target: number;
  /** Deterministic structural quality score in [0, 1]. */
  readonly confidence: number;
}

export const ChartPatternPointSchema = z.object({
  index: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  price: z.number().finite(),
  role: z.string(),
});

export const ChartPatternMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  category: z.enum(['reversal', 'continuation']),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  points: z.array(ChartPatternPointSchema),
  breakoutLevel: z.number().finite(),
  target: z.number().finite(),
  confidence: z.number().min(0).max(1),
});

export const ChartPatternCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  category: z.enum(['reversal', 'continuation']),
  description: z.string(),
});
export type ChartPatternCatalogEntry = z.infer<typeof ChartPatternCatalogEntrySchema>;

/** Per-scan tuning, resolved to concrete numbers before detectors run. */
export interface ScanContext {
  readonly bars: ReadonlyArray<Bar>;
  /** Alternating high/low swing pivots. */
  readonly pivots: ReadonlyArray<Pivot>;
  /** Equality tolerance for "near equal" price levels (fraction). */
  readonly priceTol: number;
  /** Minimum pattern height as a fraction of price. */
  readonly minHeight: number;
  /** Max bars after the last pivot in which a breakout still confirms. */
  readonly confirmWithin: number;
}

export interface ChartPatternDefinition {
  readonly id: string;
  readonly name: string;
  /** Nominal bias shown in the catalog; symmetrical structures are 'neutral'. */
  readonly direction: ChartPatternDirection;
  readonly category: ChartPatternCategory;
  readonly description: string;
  scan(ctx: ScanContext): ChartPatternMatch[];
}
