import { z } from 'zod';

export const QuoteSchema = z.object({
  time: z.number().int().nonnegative(),
  bid: z.number().finite(),
  ask: z.number().finite(),
  bidSize: z.number().nonnegative().optional(),
  askSize: z.number().nonnegative().optional(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const midpoint = (q: Quote): number => (q.bid + q.ask) / 2;
export const spread = (q: Quote): number => q.ask - q.bid;
export const spreadBps = (q: Quote): number => ((q.ask - q.bid) / midpoint(q)) * 10_000;
