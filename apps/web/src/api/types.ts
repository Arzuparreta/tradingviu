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
