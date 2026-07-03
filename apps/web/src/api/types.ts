import type { LayoutConfig } from '@tv/layout-sync';
import type { Drawing } from '@tv/core';

export interface LayoutRow {
  id: string;
  name: string;
  isDefault: boolean;
  config: LayoutConfig;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Symbol {
  id: string;
  exchange: string;
  ticker: string;
  name: string;
  assetClass: string;
  currency: string;
  active: boolean;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DomLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface DomBook {
  mid: number;
  spread: number;
  tickSize: number;
  bids: DomLevel[];
  asks: DomLevel[];
  imbalance: number;
  generatedAt: string;
}

export interface Quote {
  time: number;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  category: string;
  overlay: boolean;
  defaults: Record<string, number>;
  minBars: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface IndicatorOutput {
  name: string;
  overlay: boolean;
  lines: { key: string; color: string; type: 'line' | 'histogram' | 'band' | 'cloud' }[];
  points: IndicatorPoint[];
  bands?: { time: number; upper: number; middle: number; lower: number }[];
  histogram?: IndicatorPoint[];
}

export type PatternDirection = 'bullish' | 'bearish' | 'neutral';
export type PatternKind = 'single' | 'double' | 'triple';

export interface PatternCatalogEntry {
  id: string;
  name: string;
  kind: PatternKind;
  direction: PatternDirection;
  bars: number;
  description: string;
}

export interface PatternMatch {
  id: string;
  name: string;
  kind: PatternKind;
  direction: PatternDirection;
  index: number;
  startIndex: number;
  time: number;
}

export type ChartPatternCategory = 'reversal' | 'continuation';

export interface ChartPatternCatalogEntry {
  id: string;
  name: string;
  direction: PatternDirection;
  category: ChartPatternCategory;
  description: string;
}

export interface ChartPatternPoint {
  index: number;
  time: number;
  price: number;
  role: string;
}

export interface ChartPatternMatch {
  id: string;
  name: string;
  direction: PatternDirection;
  category: ChartPatternCategory;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  points: ChartPatternPoint[];
  breakoutLevel: number;
  target: number;
  confidence: number;
}

export interface VolumeProfileRow {
  index: number;
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  isPoc: boolean;
  inValueArea: boolean;
}

export interface VolumeProfile {
  bins: number;
  binSize: number;
  priceLow: number;
  priceHigh: number;
  barCount: number;
  startTime: number;
  endTime: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  poc: number;
  pocIndex: number;
  vah: number;
  val: number;
  valueAreaVolume: number;
  valueAreaPct: number;
  rows: VolumeProfileRow[];
}

export interface TpoProfileRow {
  index: number;
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  count: number;
  letters: string;
  isPoc: boolean;
  inValueArea: boolean;
  isSinglePrint: boolean;
}

export interface TpoProfile {
  bins: number;
  binSize: number;
  priceLow: number;
  priceHigh: number;
  barCount: number;
  periodCount: number;
  startTime: number;
  endTime: number;
  totalTpo: number;
  poc: number;
  pocIndex: number;
  vah: number;
  val: number;
  valueAreaTpo: number;
  valueAreaPct: number;
  initialBalanceHigh: number;
  initialBalanceLow: number;
  singlePrintCount: number;
  rows: TpoProfileRow[];
}

export interface IchimokuLinePoint {
  time: number;
  value: number;
}

export interface IchimokuCloudPoint {
  time: number;
  spanA: number;
  spanB: number;
  bullish: boolean;
}

export interface Ichimoku {
  tenkan: IchimokuLinePoint[];
  kijun: IchimokuLinePoint[];
  senkouA: IchimokuLinePoint[];
  senkouB: IchimokuLinePoint[];
  chikou: IchimokuLinePoint[];
  cloud: IchimokuCloudPoint[];
  params: { tenkan: number; kijun: number; senkou: number; displacement: number };
}

export type PivotMethod = 'standard' | 'fibonacci' | 'camarilla' | 'woodie' | 'demark';
export type PivotPeriod = 'D' | 'W' | 'M';
export interface PivotLevel {
  name: string;
  value: number;
}
export interface PivotSet {
  startTime: number;
  endTime: number;
  basisHigh: number;
  basisLow: number;
  basisClose: number;
  basisOpen: number;
  levels: PivotLevel[];
}
export interface PivotPoints {
  method: PivotMethod;
  period: PivotPeriod;
  periodCount: number;
  sets: PivotSet[];
  latest: PivotSet | null;
}

export interface Watchlist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  symbolId: string;
  color: string | null;
  note: string | null;
  sortOrder: number;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export type AlertOperator = 'above' | 'below' | 'crosses_above' | 'crosses_below' | 'equals';
export type AlertChannel = 'in_app' | 'email' | 'webhook';

export interface PriceAlertCondition {
  type: 'price';
  operator: AlertOperator;
  value: number;
}

export interface DrawingAlertCondition {
  type: 'drawing';
  operator: AlertOperator;
  drawing: Drawing;
  target?: 'line' | 'upper' | 'lower';
}

export type AlertCondition = PriceAlertCondition | DrawingAlertCondition | Record<string, unknown>;

export interface AlertRow {
  id: string;
  symbolId: string;
  name: string;
  kind: string;
  condition: AlertCondition;
  channels: AlertChannel[];
  webhookUrl: string | null;
  active: boolean;
  expiresAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export interface AlertHistoryRow {
  id: string;
  alertId: string;
  firedAt: string;
  price: string | null;
  payload: unknown;
  delivered: Record<string, boolean>;
}

export interface NewsArticle {
  id: string;
  source: string;
  url: string;
  title: string;
  body: string | null;
  symbols: string[];
  sentiment: string | null;
  publishedAt: string;
  fetchedAt: string;
}

export interface EarningsEvent {
  id: string;
  date: string;
  epsEstimate: string | null;
  epsActual: string | null;
  revenueEstimate: string | null;
  revenueActual: string | null;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export interface DividendEvent {
  id: string;
  exDate: string;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  amount: string;
  currency: string;
  frequency: string | null;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export interface EconomicEvent {
  id: string;
  country: string;
  eventAt: string;
  name: string;
  importance: 'low' | 'medium' | 'high' | string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface FundamentalSnapshot {
  id: string;
  fiscalPeriod: string;
  periodEnd: string;
  source: string;
  currency: string;
  isLatest: boolean;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  revenue: number | null;
  dividendYield: number | null;
  roe: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  fetchedAt: string;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export interface YieldCurvePoint {
  id: string;
  country: string;
  curveDate: string;
  tenorMonths: number;
  rate: number;
  currency: string;
  source: string;
  fetchedAt: string;
}

export interface MacroSeriesObservation {
  id: string;
  country: string;
  metricCode: string;
  metricName: string;
  observedAt: string;
  value: number;
  unit: string;
  frequency: string;
  source: string;
  fetchedAt: string;
}

export type ScreenerMetricFormat = 'compact' | 'price' | 'ratio' | 'percent' | 'number';

export interface ScreenerMetricDef {
  key: string;
  label: string;
  group: string;
  format: ScreenerMetricFormat;
  stored: boolean;
}

export interface ScreenerFilter {
  key: string;
  min?: number;
  max?: number;
}

export interface ScreenerQuery {
  q?: string;
  assetClass?: string;
  exchange?: string;
  country?: string;
  sector?: string;
  industry?: string;
  active?: boolean;
  filters?: ScreenerFilter[];
  /** Catalog metric key or one of ticker/name/exchange/assetClass. */
  sort?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
}

export interface ScreenerResult {
  id: string;
  ticker: string;
  name: string;
  assetClass: string;
  currency: string;
  country: string | null;
  sector: string | null;
  industry: string | null;
  active: boolean;
  exchange: string;
  metrics: Record<string, number>;
}

export interface ScreenerPreset {
  id: string;
  userId: string;
  name: string;
  assetClass: string;
  query: ScreenerQuery;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
