import { z } from 'zod';

export const FundamentalMetricSchema = z.enum([
  'marketCap',
  'peRatio',
  'eps',
  'revenue',
  'grossProfit',
  'operatingIncome',
  'netIncome',
  'totalAssets',
  'totalLiabilities',
  'totalEquity',
  'cash',
  'debt',
  'dividendYield',
  'payoutRatio',
  'roe',
  'roa',
  'roic',
  'grossMargin',
  'operatingMargin',
  'netMargin',
  'revenueGrowth',
  'earningsGrowth',
  'bookValuePerShare',
  'freeCashFlow',
  'operatingCashFlow',
  'sharesOutstanding',
  'shortInterest',
  'beta',
  '52WeekHigh',
  '52WeekLow',
]);
export type FundamentalMetric = z.infer<typeof FundamentalMetricSchema>;

export const FundamentalPointSchema = z.object({
  symbol: z.string(),
  period: z.string(),
  metric: FundamentalMetricSchema,
  value: z.number(),
  source: z.string(),
  updatedAt: z.number().int(),
});
export type FundamentalPoint = z.infer<typeof FundamentalPointSchema>;
