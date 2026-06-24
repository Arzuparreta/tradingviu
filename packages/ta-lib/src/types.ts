import { z } from 'zod';
import type { Bar } from '@tv/data-types';

export type IndicatorPoint = { time: number; value: number };
export type IndicatorBand = { upper: number; middle: number; lower: number };

export interface IndicatorOutput {
  name: string;
  overlay: boolean;
  lines: { key: string; color: string; type: 'line' | 'histogram' | 'band' | 'cloud' }[];
  points: IndicatorPoint[];
  bands?: { time: number; upper: number; middle: number; lower: number }[];
  histogram?: IndicatorPoint[];
}

export interface IndicatorDefinition<TParams = Record<string, number>> {
  readonly name: string;
  readonly category: 'overlap' | 'momentum' | 'volatility' | 'volume' | 'trend';
  readonly overlay: boolean;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly defaults: TParams;
  readonly minBars: number;
  compute(bars: ReadonlyArray<Bar>, params: TParams): IndicatorOutput;
}

export const ParamSchema = z.object({
  length: z.number().int().min(1).max(500).default(14),
});
export type Param = z.infer<typeof ParamSchema>;
