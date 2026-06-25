import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { ScreenerQuery } from '@tv/core';
import { exchanges, fundamentalSnapshots, symbols } from '@tv/db/schema';

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
  readonly metrics: Record<string, number>;
}

/** How a metric value should be rendered by clients. */
export type ScreenerMetricFormat = 'compact' | 'price' | 'ratio' | 'percent' | 'number';

/** One entry of the screener metric catalog (a filterable / sortable column). */
export interface ScreenerMetricDef {
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly format: ScreenerMetricFormat;
  /** True when the metric is backed by a dedicated `fundamental_snapshots`
   * column; otherwise it is read from the snapshot's `metadata` JSON. */
  readonly stored: boolean;
}

// Metrics backed by dedicated columns (fast, indexed). Everything else is
// read from the snapshot's `metadata` JSON, so the catalog scales without a
// migration per metric.
const COLUMN_MAP = {
  marketCap: fundamentalSnapshots.marketCap,
  peRatio: fundamentalSnapshots.peRatio,
  eps: fundamentalSnapshots.eps,
  revenue: fundamentalSnapshots.revenue,
  dividendYield: fundamentalSnapshots.dividendYield,
  roe: fundamentalSnapshots.roe,
  revenueGrowth: fundamentalSnapshots.revenueGrowth,
  earningsGrowth: fundamentalSnapshots.earningsGrowth,
  beta: fundamentalSnapshots.beta,
  '52WeekHigh': fundamentalSnapshots.week52High,
  '52WeekLow': fundamentalSnapshots.week52Low,
} as const;

type ColumnMetricKey = keyof typeof COLUMN_MAP;
const isColumnMetric = (key: string): key is ColumnMetricKey =>
  Object.prototype.hasOwnProperty.call(COLUMN_MAP, key);

type CatalogSeed = readonly [key: string, label: string, format: ScreenerMetricFormat][];
const group = (name: string, seeds: CatalogSeed): ScreenerMetricDef[] =>
  seeds.map(([key, label, format]) => ({ key, label, group: name, format, stored: isColumnMetric(key) }));

/**
 * The screener metric catalog: a large, grouped set of fundamental, valuation,
 * growth, dividend, balance-sheet, performance and technical metrics. Eleven
 * are column-backed; the rest are metadata-backed, so the catalog can grow to
 * hundreds of metrics as data lands without any schema or code change per
 * metric.
 */
export const screenerMetricCatalog: readonly ScreenerMetricDef[] = [
  ...group('Valuation', [
    ['marketCap', 'Market cap', 'compact'],
    ['enterpriseValue', 'Enterprise value', 'compact'],
    ['peRatio', 'P/E', 'ratio'],
    ['forwardPe', 'Forward P/E', 'ratio'],
    ['pegRatio', 'PEG', 'ratio'],
    ['priceToSales', 'P/S', 'ratio'],
    ['priceToBook', 'P/B', 'ratio'],
    ['priceToFcf', 'P/FCF', 'ratio'],
    ['evToEbitda', 'EV/EBITDA', 'ratio'],
    ['evToSales', 'EV/Sales', 'ratio'],
    ['evToEbit', 'EV/EBIT', 'ratio'],
    ['earningsYield', 'Earnings yield', 'percent'],
  ]),
  ...group('Per share', [
    ['eps', 'EPS', 'number'],
    ['epsDiluted', 'EPS (diluted)', 'number'],
    ['bookValuePerShare', 'Book value / share', 'number'],
    ['cashPerShare', 'Cash / share', 'number'],
    ['revenuePerShare', 'Revenue / share', 'number'],
    ['fcfPerShare', 'FCF / share', 'number'],
    ['dividendPerShare', 'Dividend / share', 'number'],
  ]),
  ...group('Profitability', [
    ['roe', 'Return on equity', 'percent'],
    ['roa', 'Return on assets', 'percent'],
    ['roic', 'Return on capital', 'percent'],
    ['grossMargin', 'Gross margin', 'percent'],
    ['operatingMargin', 'Operating margin', 'percent'],
    ['netMargin', 'Net margin', 'percent'],
    ['ebitdaMargin', 'EBITDA margin', 'percent'],
    ['fcfMargin', 'FCF margin', 'percent'],
  ]),
  ...group('Income', [
    ['revenue', 'Revenue', 'compact'],
    ['grossProfit', 'Gross profit', 'compact'],
    ['operatingIncome', 'Operating income', 'compact'],
    ['ebitda', 'EBITDA', 'compact'],
    ['ebit', 'EBIT', 'compact'],
    ['netIncome', 'Net income', 'compact'],
    ['freeCashFlow', 'Free cash flow', 'compact'],
    ['operatingCashFlow', 'Operating cash flow', 'compact'],
  ]),
  ...group('Growth', [
    ['revenueGrowth', 'Revenue growth', 'percent'],
    ['earningsGrowth', 'Earnings growth', 'percent'],
    ['epsGrowth', 'EPS growth', 'percent'],
    ['ebitdaGrowth', 'EBITDA growth', 'percent'],
    ['fcfGrowth', 'FCF growth', 'percent'],
    ['revenueGrowth3y', 'Revenue growth 3Y', 'percent'],
    ['revenueGrowth5y', 'Revenue growth 5Y', 'percent'],
    ['dividendGrowth', 'Dividend growth', 'percent'],
  ]),
  ...group('Dividends', [
    ['dividendYield', 'Dividend yield', 'percent'],
    ['payoutRatio', 'Payout ratio', 'percent'],
    ['yearsOfDividendGrowth', 'Years of dividend growth', 'number'],
  ]),
  ...group('Balance sheet', [
    ['totalAssets', 'Total assets', 'compact'],
    ['totalDebt', 'Total debt', 'compact'],
    ['netDebt', 'Net debt', 'compact'],
    ['cashAndEquivalents', 'Cash & equivalents', 'compact'],
    ['totalEquity', 'Total equity', 'compact'],
    ['sharesOutstanding', 'Shares outstanding', 'compact'],
    ['floatShares', 'Float', 'compact'],
  ]),
  ...group('Solvency & liquidity', [
    ['currentRatio', 'Current ratio', 'ratio'],
    ['quickRatio', 'Quick ratio', 'ratio'],
    ['debtToEquity', 'Debt / equity', 'ratio'],
    ['debtToAssets', 'Debt / assets', 'ratio'],
    ['interestCoverage', 'Interest coverage', 'ratio'],
    ['netDebtToEbitda', 'Net debt / EBITDA', 'ratio'],
  ]),
  ...group('Performance', [
    ['change1d', 'Change 1D', 'percent'],
    ['change1w', 'Change 1W', 'percent'],
    ['change1m', 'Change 1M', 'percent'],
    ['change3m', 'Change 3M', 'percent'],
    ['change6m', 'Change 6M', 'percent'],
    ['changeYtd', 'Change YTD', 'percent'],
    ['change1y', 'Change 1Y', 'percent'],
    ['change3y', 'Change 3Y', 'percent'],
    ['change5y', 'Change 5Y', 'percent'],
    ['52WeekHigh', '52-week high', 'price'],
    ['52WeekLow', '52-week low', 'price'],
    ['distanceFrom52WHigh', 'From 52W high', 'percent'],
    ['distanceFrom52WLow', 'From 52W low', 'percent'],
  ]),
  ...group('Technical & volume', [
    ['beta', 'Beta', 'ratio'],
    ['rsi14', 'RSI (14)', 'number'],
    ['atr14', 'ATR (14)', 'number'],
    ['volatility30d', 'Volatility 30D', 'percent'],
    ['avgVolume10d', 'Avg volume 10D', 'compact'],
    ['avgVolume30d', 'Avg volume 30D', 'compact'],
    ['relativeVolume', 'Relative volume', 'ratio'],
    ['sma20', 'SMA 20', 'price'],
    ['sma50', 'SMA 50', 'price'],
    ['sma200', 'SMA 200', 'price'],
    ['priceToSma50', 'Price / SMA50', 'ratio'],
    ['priceToSma200', 'Price / SMA200', 'ratio'],
  ]),
  ...group('Ownership & sentiment', [
    ['insiderOwnership', 'Insider ownership', 'percent'],
    ['institutionalOwnership', 'Institutional ownership', 'percent'],
    ['shortFloat', 'Short float', 'percent'],
    ['shortRatio', 'Short ratio', 'ratio'],
    ['analystRating', 'Analyst rating', 'number'],
    ['priceTarget', 'Price target', 'price'],
    ['numAnalysts', 'Analyst count', 'number'],
  ]),
];

const catalogByKey = new Map(screenerMetricCatalog.map((d) => [d.key, d] as const));
export const isScreenerMetric = (key: string): boolean => catalogByKey.has(key);

/** Catalog metric keys (column-backed first). */
export const screenerMetricKeys = screenerMetricCatalog.map((d) => d.key);

// A guarded numeric cast: returns NULL for absent or non-numeric metadata so a
// bad value can never abort the whole query with a cast error.
const NUMERIC_RE = '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$';

/** SQL expression yielding a metric's numeric value, or null for unknown keys. */
export const metricExpr = (key: string): SQL<number | null> | null => {
  if (isColumnMetric(key)) return sql`${COLUMN_MAP[key]}`;
  if (!catalogByKey.has(key)) return null;
  const text = sql`${fundamentalSnapshots.metadata} ->> ${key}`;
  return sql`CASE WHEN (${text}) ~ ${NUMERIC_RE} THEN (${text})::double precision END`;
};

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
  if (query.industry) filters.push(ilike(symbols.industry, `%${query.industry}%`));

  for (const f of query.filters) {
    const expr = metricExpr(f.key);
    if (!expr) continue;
    if (f.min !== undefined) filters.push(sql`${expr} >= ${f.min}`);
    if (f.max !== undefined) filters.push(sql`${expr} <= ${f.max}`);
  }

  return filters;
};

const sortExpression = (field: string): SQL => {
  switch (field) {
    case 'ticker':
      return sql`${symbols.ticker}`;
    case 'name':
      return sql`${symbols.name}`;
    case 'exchange':
      return sql`${exchanges.code}`;
    case 'assetClass':
      return sql`${symbols.assetClass}`;
    default:
      return metricExpr(field) ?? sql`${symbols.ticker}`;
  }
};

/** Order-by expression with NULLS LAST so symbols missing the metric sink. */
export const screenerOrderBy = (field: string, direction: 'asc' | 'desc'): SQL => {
  const expr = sortExpression(field);
  return direction === 'asc' ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
};

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * Read every catalog metric present in `source` (a column-value record or a
 * snapshot's metadata JSON) into a flat numeric record. Call once per source
 * and merge to combine column-backed and metadata-backed metrics.
 */
export const readScreenerMetrics = (source: unknown): Record<string, number> => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const record = source as Record<string, unknown>;
  const metrics: Record<string, number> = {};
  for (const key of screenerMetricKeys) {
    const value = finiteNumber(record[key]);
    if (value !== undefined) metrics[key] = value;
  }
  return metrics;
};
