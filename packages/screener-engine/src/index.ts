import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { ScreenerMetric, ScreenerQuery, ScreenerSortField } from '@tv/core';
import { exchanges, symbols } from '@tv/db/schema';

export interface ScreenerSymbolRow {
  readonly id: string;
  readonly ticker: string;
  readonly name: string;
  readonly assetClass: string;
  readonly currency: string;
  readonly country: string | null;
  readonly sector: string | null;
  readonly industry: string | null;
  readonly active: boolean;
  readonly exchange: string;
  readonly metrics: Partial<Record<ScreenerMetric, number>>;
}

export const screenerMetricKeys = [
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
] as const satisfies readonly ScreenerMetric[];

type ScreenerMetricKey = (typeof screenerMetricKeys)[number];

const metricJsonKey: Record<ScreenerMetric, string> = {
  marketCap: 'marketCap',
  peRatio: 'peRatio',
  eps: 'eps',
  revenue: 'revenue',
  dividendYield: 'dividendYield',
  roe: 'roe',
  revenueGrowth: 'revenueGrowth',
  earningsGrowth: 'earningsGrowth',
  beta: 'beta',
  '52WeekHigh': '52WeekHigh',
  '52WeekLow': '52WeekLow',
};

const metricExpr = (metric: ScreenerMetric): SQL<number> =>
  sql<number>`NULLIF(${symbols.metadata}->>${metricJsonKey[metric]}, '')::double precision`;

export const maybeWhere = (filters: readonly SQL[]): SQL | undefined =>
  filters.length > 0 ? and(...filters) : undefined;

export const buildScreenerFilters = (query: ScreenerQuery): readonly SQL[] => {
  const filters: SQL[] = [];

  if (query.active !== false) filters.push(eq(symbols.active, true));
  if (query.q) {
    const like = `%${query.q}%`;
    filters.push(
      or(
        ilike(symbols.ticker, like),
        ilike(symbols.name, like),
        ilike(symbols.sector, like),
        ilike(symbols.industry, like),
      )!,
    );
  }
  if (query.assetClass) filters.push(eq(symbols.assetClass, query.assetClass));
  if (query.exchange) filters.push(ilike(exchanges.code, query.exchange));
  if (query.country) filters.push(ilike(symbols.country, query.country));
  if (query.sector) filters.push(ilike(symbols.sector, `%${query.sector}%`));

  for (const metric of screenerMetricKeys) {
    const min = query[`${metric}Min`];
    const max = query[`${metric}Max`];
    if (min !== undefined) filters.push(sql`${metricExpr(metric)} >= ${min}`);
    if (max !== undefined) filters.push(sql`${metricExpr(metric)} <= ${max}`);
  }

  return filters;
};

export const sortExpression = (field: ScreenerSortField): SQL => {
  switch (field) {
    case 'ticker':
      return sql`${symbols.ticker}`;
    case 'name':
      return sql`${symbols.name}`;
    case 'exchange':
      return sql`${exchanges.code}`;
    case 'assetClass':
      return sql`${symbols.assetClass}`;
    case 'marketCap':
    case 'peRatio':
    case 'eps':
    case 'revenue':
    case 'dividendYield':
    case 'roe':
    case 'revenueGrowth':
    case 'earningsGrowth':
    case 'beta':
    case '52WeekHigh':
    case '52WeekLow':
      return metricExpr(field);
  }
};

export const sortBy = (field: ScreenerSortField, direction: 'asc' | 'desc') =>
  direction === 'asc' ? asc(sortExpression(field)) : desc(sortExpression(field));

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

export const readScreenerMetrics = (metadata: unknown): Partial<Record<ScreenerMetric, number>> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const record = metadata as Record<string, unknown>;
  const metrics: Partial<Record<ScreenerMetric, number>> = {};
  for (const metric of screenerMetricKeys) {
    const value = finiteNumber(record[metric]);
    if (value !== undefined) metrics[metric] = value;
  }
  return metrics;
};
