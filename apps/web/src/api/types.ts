import type { LayoutConfig } from '@tv/layout-sync';

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
  globalRole: 'super_admin' | 'user';
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  planCode: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  tenant: Tenant;
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

export interface Plan {
  code: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  quotas: Record<string, unknown>;
  features: string[];
  sortOrder: number;
  isPublic: boolean;
  isDefault: boolean;
}

export type AlertOperator = 'above' | 'below' | 'crosses_above' | 'crosses_below' | 'equals';
export type AlertChannel = 'in_app' | 'email' | 'webhook';

export interface PriceAlertCondition {
  type: 'price';
  operator: AlertOperator;
  value: number;
}

export interface AlertRow {
  id: string;
  symbolId: string;
  name: string;
  kind: string;
  condition: PriceAlertCondition | Record<string, unknown>;
  channels: AlertChannel[];
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
  tenantId: string;
  firedAt: string;
  price: string | null;
  payload: unknown;
  delivered: Record<string, boolean>;
}

export interface PortfolioRow {
  id: string;
  name: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioHolding {
  id: string;
  symbolId: string;
  quantity: string;
  avgCost: string | null;
  openedAt: string;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export interface PortfolioTransaction {
  id: string;
  tenantId: string;
  portfolioId: string;
  symbolId: string;
  side: 'buy' | 'sell' | 'dividend';
  quantity: string;
  price: string;
  fee: string;
  occurredAt: string;
  note: string | null;
}

export interface PortfolioMetrics {
  invested: number;
  marketValue: number;
  realizedPnl: number;
  dividends: number;
  fees: number;
  openPositions: number;
}

export interface PaperAccount {
  id: string;
  name: string;
  balance: string;
  currency: string;
  leverage: string;
  createdAt: string;
}

export interface PaperOrder {
  id: string;
  symbolId: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: string;
  price: string | null;
  status: 'pending' | 'filled';
  filledAt: string | null;
  fillPrice: string | null;
  fee: string;
  createdAt: string;
  symbol: {
    id: string;
    ticker: string;
    name: string;
    exchange: string;
  };
}

export type BrokerId = 'alpaca' | 'ibkr' | 'binance';
export type BrokerConnectionStatus = 'connected' | 'error' | 'disabled';

export interface BrokerConnection {
  id: string;
  broker: BrokerId;
  label: string | null;
  accountId: string | null;
  status: BrokerConnectionStatus;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface BrokerHealth {
  broker: BrokerId;
  ok: boolean;
  latencyMs: number;
  message?: string;
}

export interface BrokerAccount {
  id: string;
  broker: BrokerId;
  name: string;
  currency: string;
  equity: number;
  cash: number;
  buyingPower: number;
  status: string;
}

export interface BrokerPosition {
  broker: BrokerId;
  accountId?: string;
  symbol: string;
  quantity: number;
  averagePrice?: number;
  marketPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
}

export interface BrokerOrder {
  id: string;
  broker: BrokerId;
  accountId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  limitPrice?: number;
  status: 'new' | 'partially_filled' | 'filled' | 'canceled' | 'rejected' | 'expired';
  submittedAt?: string;
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

export type ScreenerMetric =
  | 'marketCap'
  | 'peRatio'
  | 'eps'
  | 'revenue'
  | 'dividendYield'
  | 'roe'
  | 'revenueGrowth'
  | 'earningsGrowth'
  | 'beta'
  | '52WeekHigh'
  | '52WeekLow';

export type ScreenerSortField = 'ticker' | 'name' | 'exchange' | 'assetClass' | ScreenerMetric;

export interface ScreenerQuery {
  q?: string;
  assetClass?: string;
  exchange?: string;
  country?: string;
  sector?: string;
  active?: boolean;
  marketCapMin?: number;
  marketCapMax?: number;
  peRatioMin?: number;
  peRatioMax?: number;
  epsMin?: number;
  epsMax?: number;
  revenueMin?: number;
  revenueMax?: number;
  dividendYieldMin?: number;
  dividendYieldMax?: number;
  roeMin?: number;
  roeMax?: number;
  revenueGrowthMin?: number;
  revenueGrowthMax?: number;
  earningsGrowthMin?: number;
  earningsGrowthMax?: number;
  betaMin?: number;
  betaMax?: number;
  '52WeekHighMin'?: number;
  '52WeekHighMax'?: number;
  '52WeekLowMin'?: number;
  '52WeekLowMax'?: number;
  sort?: ScreenerSortField;
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
  metrics: Partial<Record<ScreenerMetric, number>>;
}

export interface ScreenerPreset {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  assetClass: string;
  query: ScreenerQuery;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OptionType = 'call' | 'put';
export type OptionSide = 'long' | 'short';
export type StrategyTemplate =
  | 'long_call'
  | 'long_put'
  | 'short_call'
  | 'short_put'
  | 'bull_call_spread'
  | 'bear_call_spread'
  | 'bull_put_spread'
  | 'bear_put_spread'
  | 'straddle'
  | 'strangle'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'call_butterfly';

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionPriceResult {
  price: number;
  intrinsic: number;
  extrinsic: number;
  greeks: Greeks;
}

export interface PricedLeg {
  type: OptionType;
  side: OptionSide;
  strike: number;
  quantity: number;
  expiry: number;
  premium: number;
  greeks: Greeks;
}

export interface PayoffPoint {
  price: number;
  pnl: number;
}

export interface StrategyAnalysis {
  legs: PricedLeg[];
  netDebit: number;
  netGreeks: Greeks;
  payoff: PayoffPoint[];
  maxProfit: number | null;
  maxLoss: number | null;
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
  breakevens: number[];
}

export type IdeaDirection = 'long' | 'short' | 'neutral';
export type IdeaVisibility = 'public' | 'private';

export interface IdeaAuthor {
  id: string;
  displayName: string | null;
  email: string;
  following?: boolean;
}

export interface FollowUser {
  id: string;
  displayName: string | null;
  email: string;
  ideasCount: number;
  followedAt?: string;
}

export interface IdeaSymbol {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
}

export interface IdeaRow {
  id: string;
  title: string;
  body: string | null;
  direction: IdeaDirection | null;
  visibility: IdeaVisibility;
  snapshotUrl: string | null;
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  createdAt: string;
  updatedAt: string;
  author: IdeaAuthor;
  symbol: IdeaSymbol | null;
}

export interface CommentRow {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: IdeaAuthor;
}
