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
