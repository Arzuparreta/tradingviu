import type {
  AuthResponse,
  Bar,
  IndicatorDef,
  IndicatorOutput,
  Plan,
  Symbol,
  User,
  Tenant,
  Watchlist,
  WatchlistItem,
} from './types';

const TOKEN_KEY = 'tv_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const headers = (): HeadersInit => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
};

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public meta?: Record<string, unknown>) {
    super(message);
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; meta?: Record<string, unknown> } };
    throw new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? `HTTP ${res.status}`, body.error?.meta);
  }
  return (await res.json()) as T;
};

export const api = {
  signup: (body: { email: string; password: string; displayName?: string; tenantName?: string; tenantSlug?: string }) =>
    request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; tenant: Tenant } | { user: null }>('/auth/me'),
  symbols: (q: string) => request<{ results: Symbol[] }>(`/api/symbols/search?q=${encodeURIComponent(q)}&limit=20`),
  allSymbols: (limit = 100) => request<{ results: Symbol[] }>(`/api/symbols?limit=${limit}`),
  search: (q: string, opts: { assetClass?: string; limit?: number } = {}) => {
    const p = new URLSearchParams({ q, limit: String(opts.limit ?? 20) });
    if (opts.assetClass) p.set('assetClass', opts.assetClass);
    return request<{ results: Symbol[]; backend: 'meili' | 'db' }>(`/api/search?${p.toString()}`);
  },
  history: (symbol: string, interval = '1h', limit = 500) =>
    request<{ symbol: { id: string; exchange: string; ticker: string; name: string }; interval: string; bars: Bar[] }>(
      `/api/chart/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    ),
  plans: () => request<{ plans: Plan[] }>('/api/billing/plans'),
  quotas: () => request<{ planCode: string; quotas: Record<string, unknown> }>('/api/billing/quotas'),
  checkout: (planCode: string, cycle: 'monthly' | 'yearly' = 'monthly') =>
    request<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ planCode, cycle }) }),
  portal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  adminStats: () => request<{ tenants: number; users: number; exchanges: number; symbols: number }>('/admin/stats'),
  indicators: () => request<{ indicators: IndicatorDef[] }>('/api/indicators'),
  computeIndicator: (id: string, symbol: string, interval = '1h', params: Record<string, number> = {}, limit = 500) =>
    request<{ indicator: { id: string; name: string; overlay: boolean; lines: { key: string; color: string; type: string }[] }; output: IndicatorOutput }>(
      '/api/indicators/compute',
      { method: 'POST', body: JSON.stringify({ id, symbol, interval, params, limit }) },
    ),
  watchlists: () => request<{ watchlists: Watchlist[] }>('/api/watchlists'),
  createWatchlist: (name: string) =>
    request<{ id: string }>('/api/watchlists', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteWatchlist: (id: string) =>
    request<{ ok: true }>(`/api/watchlists/${id}`, { method: 'DELETE' }),
  watchlistItems: (id: string) =>
    request<{ items: WatchlistItem[] }>(`/api/watchlists/${id}/items`),
  addToWatchlist: (id: string, symbol: string) =>
    request<{ id: string }>(`/api/watchlists/${id}/items`, { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (id: string, itemId: string) =>
    request<{ ok: true }>(`/api/watchlists/${id}/items/${itemId}`, { method: 'DELETE' }),
};

export type {
  Bar,
  IndicatorDef,
  IndicatorOutput,
  Watchlist,
  WatchlistItem,
  Plan,
};

export { ApiError };
