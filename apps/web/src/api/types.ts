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
