import { z } from 'zod';

export const DomLevelSchema = z.object({
  price: z.number().finite().positive(),
  size: z.number().finite().nonnegative(),
  cumulative: z.number().finite().nonnegative(),
});
export type DomLevel = z.infer<typeof DomLevelSchema>;

export const DomBookSchema = z.object({
  mid: z.number().finite().positive(),
  spread: z.number().finite().nonnegative(),
  tickSize: z.number().finite().positive(),
  bids: z.array(DomLevelSchema).min(1),
  asks: z.array(DomLevelSchema).min(1),
  imbalance: z.number().finite().min(-1).max(1),
  generatedAt: z.coerce.date(),
});
export type DomBook = z.infer<typeof DomBookSchema>;

export const DomQuerySchema = z.object({
  symbol: z.string().min(1),
  levels: z.coerce.number().int().min(3).max(50).default(16),
  tickSize: z.coerce.number().finite().positive().optional(),
});
export type DomQuery = z.infer<typeof DomQuerySchema>;
