import { z } from 'zod';

export const NewsQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(32).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  sentiment: z.string().trim().min(1).max(32).optional(),
  q: z.string().trim().min(1).max(160).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type NewsQuery = z.infer<typeof NewsQuerySchema>;

export const EarningsCalendarQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type EarningsCalendarQuery = z.infer<typeof EarningsCalendarQuerySchema>;

export const EconomicCalendarQuerySchema = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type EconomicCalendarQuery = z.infer<typeof EconomicCalendarQuerySchema>;
