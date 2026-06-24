import { z } from 'zod';

export const DataProviderIdSchema = z.enum([
  'ccxt',
  'binance',
  'coinbase',
  'kraken',
  'bybit',
  'alpaca',
  'polygon',
  'yahoo',
  'oanda',
  'fred',
  'newsapi',
  'finnhub',
  'manual',
]);
export type DataProviderId = z.infer<typeof DataProviderIdSchema>;

export const ProviderCapabilitiesSchema = z.object({
  realtime: z.boolean(),
  historical: z.boolean(),
  fundamentals: z.boolean(),
  news: z.boolean(),
  calendar: z.boolean(),
  requiresKey: z.boolean(),
  assetClasses: z.array(z.string()),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ProviderHealthSchema = z.object({
  provider: DataProviderIdSchema,
  status: z.enum(['healthy', 'degraded', 'down', 'unknown']),
  latencyMs: z.number().int().optional(),
  rateLimit: z
    .object({
      remaining: z.number().int(),
      reset: z.number().int().optional(),
    })
    .optional(),
  lastError: z.string().optional(),
  checkedAt: z.number().int(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
