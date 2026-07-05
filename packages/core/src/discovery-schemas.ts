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

/**
 * A single numeric screener filter: a metric `key` (from the screener metric
 * catalog) constrained by an optional `min` and/or `max`. Replaces the fixed
 * per-metric `<metric>Min/<metric>Max` fields so the screener scales to the
 * full catalog (and beyond, as metadata-backed metrics land) without a schema
 * change per metric.
 */
export const ScreenerFilterSchema = z.object({
  key: z.string().trim().min(1).max(60),
  min: z.coerce.number().finite().optional(),
  max: z.coerce.number().finite().optional(),
});
export type ScreenerFilter = z.infer<typeof ScreenerFilterSchema>;

export const ScreenerQuerySchema = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  assetClass: z.string().trim().min(1).max(40).optional(),
  exchange: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(1).max(80).optional(),
  sector: z.string().trim().min(1).max(120).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  active: z.coerce.boolean().default(true),
  filters: z.array(ScreenerFilterSchema).max(60).default([]),
  /** Catalog metric key, or one of ticker/name/exchange/assetClass. */
  sort: z.string().trim().min(1).max(60).default('marketCap'),
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

export const FundamentalsIngestQuerySchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).default([]),
  fiscalPeriod: z.string().trim().min(1).max(20).default('ttm'),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type FundamentalsIngestQuery = z.infer<typeof FundamentalsIngestQuerySchema>;

const optionalFundamentalMetric = z.number().finite().nullable().optional();

export const FundamentalProviderSnapshotSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  fiscalPeriod: z.string().trim().min(1).max(20).default('ttm'),
  periodEnd: z.coerce.date(),
  source: z.string().trim().min(1).max(80).optional(),
  currency: z.string().trim().min(1).max(12).default('USD'),
  isLatest: z.boolean().default(true),
  marketCap: optionalFundamentalMetric,
  peRatio: optionalFundamentalMetric,
  eps: optionalFundamentalMetric,
  revenue: optionalFundamentalMetric,
  dividendYield: optionalFundamentalMetric,
  roe: optionalFundamentalMetric,
  revenueGrowth: optionalFundamentalMetric,
  earningsGrowth: optionalFundamentalMetric,
  beta: optionalFundamentalMetric,
  week52High: optionalFundamentalMetric,
  week52Low: optionalFundamentalMetric,
});
export type FundamentalProviderSnapshot = z.infer<typeof FundamentalProviderSnapshotSchema>;

export const NormalizedFundamentalSnapshotSchema = FundamentalProviderSnapshotSchema.extend({
  source: z.string().trim().min(1).max(80),
  fetchedAt: z.date(),
});
export type NormalizedFundamentalSnapshot = z.infer<typeof NormalizedFundamentalSnapshotSchema>;

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
  latestOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type MacroSeriesQuery = z.infer<typeof MacroSeriesQuerySchema>;

export const MacroIngestQuerySchema = z.object({
  country: z.string().trim().min(1).max(80).default('US'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type MacroIngestQuery = z.infer<typeof MacroIngestQuerySchema>;

export const YieldCurveProviderPointSchema = z.object({
  country: z.string().trim().min(1).max(80),
  curveDate: z.coerce.date(),
  tenorMonths: z.number().int().positive(),
  rate: z.number().finite(),
  currency: z.string().trim().min(1).max(12).default('USD'),
  source: z.string().trim().min(1).max(80).optional(),
});
export type YieldCurveProviderPoint = z.infer<typeof YieldCurveProviderPointSchema>;

export const MacroSeriesProviderObservationSchema = z.object({
  country: z.string().trim().min(1).max(80),
  metricCode: z.string().trim().min(1).max(80),
  metricName: z.string().trim().min(1).max(160),
  observedAt: z.coerce.date(),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  frequency: z.string().trim().min(1).max(40),
  source: z.string().trim().min(1).max(80).optional(),
});
export type MacroSeriesProviderObservation = z.infer<typeof MacroSeriesProviderObservationSchema>;

export const NormalizedYieldCurvePointSchema = YieldCurveProviderPointSchema.extend({
  source: z.string().trim().min(1).max(80),
  fetchedAt: z.date(),
});
export type NormalizedYieldCurvePoint = z.infer<typeof NormalizedYieldCurvePointSchema>;

export const NormalizedMacroSeriesObservationSchema = MacroSeriesProviderObservationSchema.extend({
  source: z.string().trim().min(1).max(80),
  fetchedAt: z.date(),
});
export type NormalizedMacroSeriesObservation = z.infer<
  typeof NormalizedMacroSeriesObservationSchema
>;

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

const optionalEventText = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
}, z.string().min(1).max(80).optional());

const requiredEventText = z.preprocess((value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : value;
  if (typeof value === 'string') return value.trim();
  return value;
}, z.string().min(1).max(40));

export const CalendarIngestQuerySchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).default([]),
  country: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(250),
});
export type CalendarIngestQuery = z.infer<typeof CalendarIngestQuerySchema>;

export const EarningsProviderEventSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  date: z.coerce.date(),
  epsEstimate: optionalEventText,
  epsActual: optionalEventText,
  revenueEstimate: optionalEventText,
  revenueActual: optionalEventText,
});
export type EarningsProviderEvent = z.infer<typeof EarningsProviderEventSchema>;

export const NormalizedEarningsEventSchema = EarningsProviderEventSchema.extend({
  fetchedAt: z.date(),
});
export type NormalizedEarningsEvent = z.infer<typeof NormalizedEarningsEventSchema>;

export const DividendProviderEventSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  exDate: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  recordDate: z.coerce.date().optional(),
  declarationDate: z.coerce.date().optional(),
  amount: requiredEventText,
  currency: z.string().trim().min(1).max(12).default('USD'),
  frequency: z.string().trim().min(1).max(40).optional(),
});
export type DividendProviderEvent = z.infer<typeof DividendProviderEventSchema>;

export const NormalizedDividendEventSchema = DividendProviderEventSchema.extend({
  fetchedAt: z.date(),
});
export type NormalizedDividendEvent = z.infer<typeof NormalizedDividendEventSchema>;

export const EconomicImportanceSchema = z.enum(['low', 'medium', 'high']);
export type EconomicImportance = z.infer<typeof EconomicImportanceSchema>;

export const EconomicProviderEventSchema = z.object({
  country: z.string().trim().min(1).max(80),
  eventAt: z.coerce.date(),
  name: z.string().trim().min(1).max(200),
  importance: EconomicImportanceSchema.default('low'),
  actual: optionalEventText,
  forecast: optionalEventText,
  previous: optionalEventText,
});
export type EconomicProviderEvent = z.infer<typeof EconomicProviderEventSchema>;

export const NormalizedEconomicEventSchema = EconomicProviderEventSchema.extend({
  fetchedAt: z.date(),
});
export type NormalizedEconomicEvent = z.infer<typeof NormalizedEconomicEventSchema>;
