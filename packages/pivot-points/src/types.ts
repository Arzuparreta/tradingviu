import { z } from 'zod';

/** Pivot calculation method. */
export const PivotMethodSchema = z.enum(['standard', 'fibonacci', 'camarilla', 'woodie', 'demark']);
export type PivotMethod = z.infer<typeof PivotMethodSchema>;

/** The period each pivot set is anchored to (calendar Day / Week / Month). */
export const PivotPeriodSchema = z.enum(['D', 'W', 'M']);
export type PivotPeriod = z.infer<typeof PivotPeriodSchema>;

/** A named pivot level (e.g. `PP`, `R1`, `S2`). */
export interface PivotLevel {
  readonly name: string;
  readonly value: number;
}

/**
 * Pivot levels for one period, derived from the *prior* period's range. The
 * levels apply across `[startTime, endTime]` (the current period's bars).
 */
export interface PivotSet {
  readonly startTime: number;
  readonly endTime: number;
  /** Prior-period basis the levels were computed from. */
  readonly basisHigh: number;
  readonly basisLow: number;
  readonly basisClose: number;
  readonly basisOpen: number;
  readonly levels: readonly PivotLevel[];
}

/**
 * Pivot points over a window of OHLCV bars. Pure and deterministic: a function
 * of the bars, method, and period only.
 */
export interface PivotPoints {
  readonly method: PivotMethod;
  readonly period: PivotPeriod;
  /** Number of calendar periods the bars span. */
  readonly periodCount: number;
  /** One set per current period that has a prior period (low → high time). */
  readonly sets: readonly PivotSet[];
  /** The most recent set (today's pivots), or null when not enough history. */
  readonly latest: PivotSet | null;
}

export const PivotLevelSchema = z.object({
  name: z.string(),
  value: z.number().finite(),
});

export const PivotSetSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  basisHigh: z.number().finite(),
  basisLow: z.number().finite(),
  basisClose: z.number().finite(),
  basisOpen: z.number().finite(),
  levels: z.array(PivotLevelSchema),
});

export const PivotPointsSchema = z.object({
  method: PivotMethodSchema,
  period: PivotPeriodSchema,
  periodCount: z.number().int().nonnegative(),
  sets: z.array(PivotSetSchema),
  latest: PivotSetSchema.nullable(),
});

export interface PivotPointsOptions {
  readonly method?: PivotMethod;
  readonly period?: PivotPeriod;
}
