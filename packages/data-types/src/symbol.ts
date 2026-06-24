import { z } from 'zod';

export const AssetClassSchema = z.enum([
  'crypto',
  'stock',
  'etf',
  'forex',
  'future',
  'option',
  'bond',
  'index',
  'commodity',
  'economic',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const SymbolSchema = z.object({
  id: z.string(),
  exchange: z.string().min(1),
  ticker: z.string().min(1),
  name: z.string().min(1),
  assetClass: AssetClassSchema,
  currency: z.string().length(3).default('USD'),
  baseCurrency: z.string().length(3).optional(),
  quoteCurrency: z.string().length(3).optional(),
  country: z.string().length(2).optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  active: z.boolean().default(true),
});
export type Symbol = z.infer<typeof SymbolSchema>;

export const SymbolSearchResultSchema = SymbolSchema.extend({
  score: z.number().optional(),
});
export type SymbolSearchResult = z.infer<typeof SymbolSearchResultSchema>;

export const formatSymbolId = (exchange: string, ticker: string): string =>
  `${exchange}:${ticker}`.toUpperCase();

export const parseSymbolId = (
  id: string,
): { exchange: string; ticker: string } | null => {
  const idx = id.indexOf(':');
  if (idx < 0) return null;
  return { exchange: id.slice(0, idx).toUpperCase(), ticker: id.slice(idx + 1).toUpperCase() };
};
