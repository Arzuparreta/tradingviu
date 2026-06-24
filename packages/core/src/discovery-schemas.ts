import { z } from 'zod';

export const ScreenerMetricSchema = z.enum([
  'marketCap',
  'peRatio',
  'eps',
  'revenue',
  'dividendYield',
  'roe',
  'revenueGrowth',
  'earningsGrowth',
  'beta',
  '52WeekHigh',
  '52WeekLow',
]);
export type ScreenerMetric = z.infer<typeof ScreenerMetricSchema>;

export const ScreenerSortFieldSchema = z.enum([
  'ticker',
  'name',
  'exchange',
  'assetClass',
  ...ScreenerMetricSchema.options,
]);
export type ScreenerSortField = z.infer<typeof ScreenerSortFieldSchema>;

const numericFilter = z.coerce.number().finite().optional();

export const ScreenerQuerySchema = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  assetClass: z.string().trim().min(1).max(40).optional(),
  exchange: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(1).max(80).optional(),
  sector: z.string().trim().min(1).max(120).optional(),
  active: z.coerce.boolean().default(true),
  marketCapMin: numericFilter,
  marketCapMax: numericFilter,
  peRatioMin: numericFilter,
  peRatioMax: numericFilter,
  epsMin: numericFilter,
  epsMax: numericFilter,
  revenueMin: numericFilter,
  revenueMax: numericFilter,
  dividendYieldMin: numericFilter,
  dividendYieldMax: numericFilter,
  roeMin: numericFilter,
  roeMax: numericFilter,
  revenueGrowthMin: numericFilter,
  revenueGrowthMax: numericFilter,
  earningsGrowthMin: numericFilter,
  earningsGrowthMax: numericFilter,
  betaMin: numericFilter,
  betaMax: numericFilter,
  '52WeekHighMin': numericFilter,
  '52WeekHighMax': numericFilter,
  '52WeekLowMin': numericFilter,
  '52WeekLowMax': numericFilter,
  sort: ScreenerSortFieldSchema.default('marketCap'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type ScreenerQuery = z.infer<typeof ScreenerQuerySchema>;

export const ScreenerPresetQuerySchema = z.object({
  assetClass: z.string().trim().min(1).max(40).optional(),
});
export type ScreenerPresetQuery = z.infer<typeof ScreenerPresetQuerySchema>;

export const CreateScreenerPresetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  assetClass: z.string().trim().min(1).max(40).default('stock'),
  query: ScreenerQuerySchema,
  isPublic: z.boolean().default(false),
});
export type CreateScreenerPreset = z.infer<typeof CreateScreenerPresetSchema>;

export const UpdateScreenerPresetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  assetClass: z.string().trim().min(1).max(40).optional(),
  query: ScreenerQuerySchema.optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateScreenerPreset = z.infer<typeof UpdateScreenerPresetSchema>;

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

export const NewsSentimentSchema = z.enum(['negative', 'neutral', 'positive']);
export type NewsSentiment = z.infer<typeof NewsSentimentSchema>;

export const NewsProviderArticleSchema = z.object({
  source: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().url().max(2048),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000).optional(),
  symbols: z.array(z.string().trim().min(1).max(32)).default([]),
  sentiment: NewsSentimentSchema.optional(),
  publishedAt: z.coerce.date(),
});
export type NewsProviderArticle = z.infer<typeof NewsProviderArticleSchema>;

export const NormalizedNewsArticleSchema = z.object({
  source: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2048),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000).optional(),
  symbols: z.array(z.string().trim().min(1).max(32)),
  sentiment: NewsSentimentSchema.optional(),
  publishedAt: z.date(),
  fetchedAt: z.date(),
});
export type NormalizedNewsArticle = z.infer<typeof NormalizedNewsArticleSchema>;

export const NewsIngestQuerySchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).default([]),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type NewsIngestQuery = z.infer<typeof NewsIngestQuerySchema>;

export const FundamentalsQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(80).optional(),
  fiscalPeriod: z.string().trim().min(1).max(20).default('ttm'),
  latestOnly: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type FundamentalsQuery = z.infer<typeof FundamentalsQuerySchema>;

export const YieldCurveQuerySchema = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  latestOnly: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type YieldCurveQuery = z.infer<typeof YieldCurveQuerySchema>;

export const MacroSeriesQuerySchema = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  metricCode: z.string().trim().min(1).max(80).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type MacroSeriesQuery = z.infer<typeof MacroSeriesQuerySchema>;

export const EarningsCalendarQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type EarningsCalendarQuery = z.infer<typeof EarningsCalendarQuerySchema>;

export const DividendCalendarQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type DividendCalendarQuery = z.infer<typeof DividendCalendarQuerySchema>;

export const EconomicCalendarQuerySchema = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type EconomicCalendarQuery = z.infer<typeof EconomicCalendarQuerySchema>;
