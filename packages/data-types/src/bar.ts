import { z } from 'zod';
import { IntervalSchema, type Interval } from '@tv/core';

export const BarSchema = z.object({
  time: z.number().int().nonnegative(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().nonnegative().default(0),
  vwap: z.number().finite().optional(),
  trades: z.number().int().nonnegative().optional(),
});
export type Bar = z.infer<typeof BarSchema>;

export const BarsSchema = z.array(BarSchema);
export type Bars = z.infer<typeof BarsSchema>;

export const BarQuerySchema = z.object({
  symbol: z.string().min(1),
  interval: IntervalSchema,
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  limit: z.number().int().positive().max(5000).default(500),
});
export type BarQuery = z.infer<typeof BarQuerySchema>;

export const aggregateBar = (interval: Interval) => (b: Bar): Bar => b;
export const emptyBar = (time: number, o: number): Bar => ({
  time,
  open: o,
  high: o,
  low: o,
  close: o,
  volume: 0,
});
