import { z } from 'zod';
import type { Bar } from '@tv/data-types';

export type PatternDirection = 'bullish' | 'bearish' | 'neutral';
export type PatternKind = 'single' | 'double' | 'triple';

/**
 * A candlestick pattern detector. `detect` returns true when the pattern
 * completes at the bar at index `i` (the last bar of the pattern). Detectors
 * are pure functions of the bar array — no time, randomness, or I/O — so
 * detection is fully deterministic.
 */
export interface PatternDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: PatternKind;
  /** Directional bias when the pattern fires. */
  readonly direction: PatternDirection;
  /** Number of bars the pattern spans. */
  readonly bars: number;
  readonly description: string;
  detect(bars: ReadonlyArray<Bar>, i: number): boolean;
}

export interface PatternMatch {
  readonly id: string;
  readonly name: string;
  readonly kind: PatternKind;
  readonly direction: PatternDirection;
  /** Index of the completing (last) bar of the pattern. */
  readonly index: number;
  /** Index of the first bar of the pattern. */
  readonly startIndex: number;
  /** Time of the completing bar (epoch seconds). */
  readonly time: number;
}

export const PatternMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['single', 'double', 'triple']),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  index: z.number().int().nonnegative(),
  startIndex: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
});

export const PatternCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['single', 'double', 'triple']),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  bars: z.number().int().positive(),
  description: z.string(),
});
export type PatternCatalogEntry = z.infer<typeof PatternCatalogEntrySchema>;
