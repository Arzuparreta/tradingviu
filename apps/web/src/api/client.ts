import type {
  AuthResponse,
  Bar,
  DomBook,
  IndicatorDef,
  IndicatorOutput,
  PatternCatalogEntry,
  PatternMatch,
  LayoutRow,
  Plan,
  Symbol,
  User,
  Tenant,
  Watchlist,
  WatchlistItem,
  AlertRow,
  AlertHistoryRow,
  PortfolioRow,
  PortfolioHolding,
  PortfolioMetrics,
  PortfolioTransaction,
  PaperAccount,
  PaperOrder,
  BrokerAccount,
  BrokerConnection,
  BrokerHealth,
  BrokerOrder,
  BrokerPosition,
  DividendEvent,
  NewsArticle,
  EarningsEvent,
  EconomicEvent,
  FundamentalSnapshot,
  MacroSeriesObservation,
  ScreenerPreset,
  ScreenerQuery,
  ScreenerResult,
  YieldCurvePoint,
  PriceAlertCondition,
  OptionPriceResult,
  StrategyAnalysis,
  StrategyTemplate,
  IdeaRow,
  IdeaDirection,
  IdeaVisibility,
  CommentRow,
  FollowUser,
  ScriptRow,
  ScriptDetail,
  ScriptVisibility,
  ScriptsSort,
  SpaceRow,
  SpaceDetail,
  SpacePost,
  SpaceVisibility,
  SpacesSort,
} from './types';
import type { LayoutConfig } from '@tv/layout-sync';
import type { PineRunResult, ValidateResult } from '@tv/pine-runtime';

type PineInputs = Record<string, number | boolean | string>;
type PineRunResponse =
  | { ok: true; result: PineRunResult }
  | { ok: false; error: { kind: string; message: string; line?: number; column?: number } };

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
  constructor(
    public status: number,
    public code: string,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code: string; message: string; meta?: Record<string, unknown> };
    };
    throw new ApiError(
      res.status,
      body.error?.code ?? 'ERROR',
      body.error?.message ?? `HTTP ${res.status}`,
      body.error?.meta,
    );
  }
  return (await res.json()) as T;
};

const queryString = (params: object): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (
      (typeof value === 'string' && value !== '') ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      search.set(key, String(value));
    }
  }
  const raw = search.toString();
  return raw ? `?${raw}` : '';
};

export const api = {
  signup: (body: {
    email: string;
    password: string;
    displayName?: string;
    tenantName?: string;
    tenantSlug?: string;
  }) => request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; tenant: Tenant } | { user: null }>('/auth/me'),
  symbols: (q: string) =>
    request<{ results: Symbol[] }>(`/api/symbols/search?q=${encodeURIComponent(q)}&limit=20`),
  allSymbols: (limit = 100) => request<{ results: Symbol[] }>(`/api/symbols?limit=${limit}`),
  search: (q: string, opts: { assetClass?: string; limit?: number } = {}) => {
    const p = new URLSearchParams({ q, limit: String(opts.limit ?? 20) });
    if (opts.assetClass) p.set('assetClass', opts.assetClass);
    return request<{ results: Symbol[]; backend: 'meili' | 'db' }>(`/api/search?${p.toString()}`);
  },
  history: (symbol: string, interval = '1h', limit = 500) =>
    request<{
      symbol: { id: string; exchange: string; ticker: string; name: string };
      interval: string;
      bars: Bar[];
    }>(
      `/api/chart/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    ),
  dom: (symbol: string, levels = 16) =>
    request<{
      symbol: {
        id: string;
        exchange: string;
        ticker: string;
        name: string;
        assetClass: string;
        currency: string;
      };
      book: DomBook;
    }>(`/api/chart/dom?symbol=${encodeURIComponent(symbol)}&levels=${levels}`),
  plans: () => request<{ plans: Plan[] }>('/api/billing/plans'),
  quotas: () =>
    request<{ planCode: string; quotas: Record<string, unknown> }>('/api/billing/quotas'),
  checkout: (planCode: string, cycle: 'monthly' | 'yearly' = 'monthly') =>
    request<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ planCode, cycle }),
    }),
  portal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  adminStats: () =>
    request<{ tenants: number; users: number; exchanges: number; symbols: number }>('/admin/stats'),
  indicators: () => request<{ indicators: IndicatorDef[] }>('/api/indicators'),
  computeIndicator: (
    id: string,
    symbol: string,
    interval = '1h',
    params: Record<string, number> = {},
    limit = 500,
  ) =>
    request<{
      indicator: {
        id: string;
        name: string;
        overlay: boolean;
        lines: { key: string; color: string; type: string }[];
      };
      output: IndicatorOutput;
    }>('/api/indicators/compute', {
      method: 'POST',
      body: JSON.stringify({ id, symbol, interval, params, limit }),
    }),
  patterns: () => request<{ patterns: PatternCatalogEntry[] }>('/api/patterns'),
  scanPatterns: (symbol: string, interval = '1h', limit = 500, ids?: string[]) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      matches: PatternMatch[];
    }>('/api/patterns/scan', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, ...(ids ? { ids } : {}) }),
    }),
  watchlists: () => request<{ watchlists: Watchlist[] }>('/api/watchlists'),
  createWatchlist: (name: string) =>
    request<{ id: string }>('/api/watchlists', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteWatchlist: (id: string) =>
    request<{ ok: true }>(`/api/watchlists/${id}`, { method: 'DELETE' }),
  watchlistItems: (id: string) =>
    request<{ items: WatchlistItem[] }>(`/api/watchlists/${id}/items`),
  addToWatchlist: (id: string, symbol: string) =>
    request<{ id: string }>(`/api/watchlists/${id}/items`, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),
  removeFromWatchlist: (id: string, itemId: string) =>
    request<{ ok: true }>(`/api/watchlists/${id}/items/${itemId}`, { method: 'DELETE' }),
  layouts: () => request<{ layouts: LayoutRow[] }>('/api/layouts'),
  layout: (id: string) => request<{ layout: LayoutRow }>(`/api/layouts/${id}`),
  createLayout: (body: { name: string; config: LayoutConfig; isDefault?: boolean }) =>
    request<{ id: string }>('/api/layouts', { method: 'POST', body: JSON.stringify(body) }),
  updateLayout: (id: string, body: { name?: string; config?: LayoutConfig; isDefault?: boolean }) =>
    request<{ ok: true }>(`/api/layouts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLayout: (id: string) => request<{ ok: true }>(`/api/layouts/${id}`, { method: 'DELETE' }),
  pineValidate: (source: string) =>
    request<ValidateResult>('/api/pine/validate', {
      method: 'POST',
      body: JSON.stringify({ source }),
    }),
  pineRun: (body: {
    source: string;
    symbol: string;
    interval?: string;
    inputs?: PineInputs;
    limit?: number;
  }) => request<PineRunResponse>('/api/pine/run', { method: 'POST', body: JSON.stringify(body) }),
  alerts: () => request<{ alerts: AlertRow[] }>('/api/alerts'),
  createAlert: (body: {
    symbolId: string;
    name: string;
    condition: PriceAlertCondition;
    channels: string[];
    active?: boolean;
  }) => request<{ id: string }>('/api/alerts', { method: 'POST', body: JSON.stringify(body) }),
  updateAlert: (id: string, body: { active?: boolean }) =>
    request<{ ok: true }>(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAlert: (id: string) => request<{ ok: true }>(`/api/alerts/${id}`, { method: 'DELETE' }),
  evaluateAlert: (id: string, body: { price?: number; previousPrice?: number } = {}) =>
    request<{ result: { fired: boolean; value: number; reason: string } }>(
      `/api/alerts/${id}/evaluate`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  alertHistory: (id: string) =>
    request<{ history: AlertHistoryRow[] }>(`/api/alerts/${id}/history`),
  portfolios: () => request<{ portfolios: PortfolioRow[] }>('/api/portfolios'),
  createPortfolio: (body: { name: string; baseCurrency?: string }) =>
    request<{ id: string }>('/api/portfolios', { method: 'POST', body: JSON.stringify(body) }),
  portfolio: (id: string) =>
    request<{
      portfolio: PortfolioRow;
      holdings: PortfolioHolding[];
      transactions: PortfolioTransaction[];
      metrics: PortfolioMetrics;
    }>(`/api/portfolios/${id}`),
  deletePortfolio: (id: string) =>
    request<{ ok: true }>(`/api/portfolios/${id}`, { method: 'DELETE' }),
  addPortfolioTransaction: (
    id: string,
    body: {
      symbolId: string;
      side: 'buy' | 'sell' | 'dividend';
      quantity: number;
      price: number;
      fee?: number;
      note?: string;
    },
  ) =>
    request<{ id: string; metrics: PortfolioMetrics }>(`/api/portfolios/${id}/transactions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  paperAccounts: () => request<{ accounts: PaperAccount[] }>('/api/paper/accounts'),
  createPaperAccount: (body: {
    name: string;
    balance?: number;
    currency?: string;
    leverage?: number;
  }) =>
    request<{ id: string }>('/api/paper/accounts', { method: 'POST', body: JSON.stringify(body) }),
  paperAccount: (id: string) =>
    request<{ account: PaperAccount; orders: PaperOrder[] }>(`/api/paper/accounts/${id}`),
  placePaperOrder: (
    id: string,
    body: {
      symbolId: string;
      side: 'buy' | 'sell';
      type: 'market' | 'limit';
      quantity: number;
      limitPrice?: number;
      lastPrice?: number;
    },
  ) =>
    request<{
      id: string;
      fill: { status: 'filled' | 'pending'; fillPrice?: number; fee: number; cashDelta: number };
    }>(`/api/paper/accounts/${id}/orders`, { method: 'POST', body: JSON.stringify(body) }),
  priceOption: (body: {
    type: 'call' | 'put';
    spot: number;
    strike: number;
    timeToExpiry: number;
    volatility: number;
    rate?: number;
    dividendYield?: number;
  }) =>
    request<OptionPriceResult>('/api/options/price', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  analyzeStrategy: (body: {
    template?: StrategyTemplate;
    spot: number;
    volatility: number;
    timeToExpiry: number;
    rate?: number;
    width?: number;
    contracts?: number;
    priceMin?: number;
    priceMax?: number;
    steps?: number;
  }) =>
    request<StrategyAnalysis>('/api/options/strategy', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  brokerConnections: () => request<{ connections: BrokerConnection[] }>('/api/brokers/connections'),
  createBrokerConnection: (
    body:
      | {
          broker: 'alpaca';
          label?: string;
          environment?: 'paper' | 'live';
          accountId?: string;
          credentials: { apiKey: string; secretKey: string; paper: boolean };
        }
      | {
          broker: 'binance';
          label?: string;
          environment?: 'paper' | 'live';
          accountId?: string;
          credentials: { apiKey: string; secretKey: string; testnet: boolean };
        }
      | {
          broker: 'ibkr';
          label?: string;
          environment?: 'paper' | 'live';
          accountId?: string;
          credentials: { baseUrl: string; accountId?: string };
        },
  ) =>
    request<{ id: string }>('/api/brokers/connections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteBrokerConnection: (id: string) =>
    request<{ ok: true }>(`/api/brokers/connections/${id}`, { method: 'DELETE' }),
  testBrokerConnection: (id: string) =>
    request<{ health: BrokerHealth }>(`/api/brokers/connections/${id}/test`, { method: 'POST' }),
  brokerAccounts: (id: string) =>
    request<{ accounts: BrokerAccount[] }>(`/api/brokers/connections/${id}/accounts`),
  brokerPositions: (id: string, accountId?: string) =>
    request<{ positions: BrokerPosition[] }>(
      `/api/brokers/connections/${id}/positions${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`,
    ),
  placeBrokerOrder: (
    id: string,
    body: {
      symbol: string;
      side: 'buy' | 'sell';
      type: 'market' | 'limit';
      quantity: number;
      limitPrice?: number;
      timeInForce?: string;
    },
  ) =>
    request<{ order: BrokerOrder }>(`/api/brokers/connections/${id}/orders`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  news: (
    params: {
      symbol?: string;
      source?: string;
      sentiment?: string;
      q?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) => request<{ articles: NewsArticle[] }>(`/api/news${queryString(params)}`),
  earningsCalendar: (
    params: { symbol?: string; from?: string; to?: string; limit?: number } = {},
  ) => request<{ events: EarningsEvent[] }>(`/api/calendars/earnings${queryString(params)}`),
  dividendCalendar: (
    params: { symbol?: string; from?: string; to?: string; limit?: number } = {},
  ) => request<{ events: DividendEvent[] }>(`/api/calendars/dividends${queryString(params)}`),
  economicCalendar: (
    params: {
      country?: string;
      importance?: 'low' | 'medium' | 'high';
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) => request<{ events: EconomicEvent[] }>(`/api/calendars/economic${queryString(params)}`),
  fundamentals: (
    params: { symbol?: string; fiscalPeriod?: string; latestOnly?: boolean; limit?: number } = {},
  ) => request<{ snapshots: FundamentalSnapshot[] }>(`/api/fundamentals${queryString(params)}`),
  yieldCurves: (
    params: {
      country?: string;
      source?: string;
      from?: string;
      to?: string;
      latestOnly?: boolean;
      limit?: number;
    } = {},
  ) => request<{ points: YieldCurvePoint[] }>(`/api/macro/yield-curves${queryString(params)}`),
  macroSeries: (
    params: {
      country?: string;
      metricCode?: string;
      source?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) =>
    request<{ observations: MacroSeriesObservation[] }>(`/api/macro/series${queryString(params)}`),
  screener: (params: ScreenerQuery = {}) =>
    request<{ results: ScreenerResult[] }>(`/api/screener${queryString(params)}`),
  screenerPresets: (params: { assetClass?: string } = {}) =>
    request<{ presets: ScreenerPreset[] }>(`/api/screener/presets${queryString(params)}`),
  createScreenerPreset: (body: {
    name: string;
    assetClass?: string;
    query: ScreenerQuery;
    isPublic?: boolean;
  }) =>
    request<{ id: string }>('/api/screener/presets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteScreenerPreset: (id: string) =>
    request<{ ok: true }>(`/api/screener/presets/${id}`, { method: 'DELETE' }),
  ideas: (
    params: {
      symbol?: string;
      author?: string;
      direction?: IdeaDirection;
      visibility?: IdeaVisibility;
      limit?: number;
    } = {},
  ) => request<{ ideas: IdeaRow[] }>(`/api/ideas${queryString(params)}`),
  idea: (id: string) => request<{ idea: IdeaRow }>(`/api/ideas/${id}`),
  createIdea: (body: {
    title: string;
    body?: string;
    symbol?: string;
    direction?: IdeaDirection;
    visibility?: IdeaVisibility;
    snapshotUrl?: string;
  }) => request<{ id: string }>('/api/ideas', { method: 'POST', body: JSON.stringify(body) }),
  updateIdea: (
    id: string,
    body: {
      title?: string;
      body?: string;
      direction?: IdeaDirection;
      visibility?: IdeaVisibility;
      snapshotUrl?: string;
    },
  ) => request<{ ok: true }>(`/api/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteIdea: (id: string) => request<{ ok: true }>(`/api/ideas/${id}`, { method: 'DELETE' }),
  ideaComments: (id: string) => request<{ comments: CommentRow[] }>(`/api/ideas/${id}/comments`),
  addIdeaComment: (id: string, body: { body: string; parentId?: string }) =>
    request<{ id: string }>(`/api/ideas/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteIdeaComment: (id: string, commentId: string) =>
    request<{ ok: true }>(`/api/ideas/${id}/comments/${commentId}`, { method: 'DELETE' }),
  likeIdea: (id: string) =>
    request<{ liked: boolean }>(`/api/ideas/${id}/like`, { method: 'POST' }),
  unlikeIdea: (id: string) =>
    request<{ liked: boolean }>(`/api/ideas/${id}/like`, { method: 'DELETE' }),
  following: () => request<{ users: FollowUser[] }>('/api/follows/following'),
  followers: () => request<{ users: FollowUser[] }>('/api/follows/followers'),
  followSuggestions: () => request<{ users: FollowUser[] }>('/api/follows/suggestions'),
  followUser: (userId: string) =>
    request<{ following: boolean }>(`/api/follows/${userId}`, { method: 'POST' }),
  unfollowUser: (userId: string) =>
    request<{ following: boolean }>(`/api/follows/${userId}`, { method: 'DELETE' }),
  scripts: (
    params: {
      q?: string;
      author?: string;
      visibility?: ScriptVisibility;
      free?: boolean;
      sort?: ScriptsSort;
      limit?: number;
    } = {},
  ) => request<{ scripts: ScriptRow[] }>(`/api/scripts${queryString(params)}`),
  script: (id: string) => request<{ script: ScriptDetail }>(`/api/scripts/${id}`),
  publishScript: (body: {
    name: string;
    description?: string;
    source: string;
    visibility?: ScriptVisibility;
    license?: string;
    priceCents?: number;
  }) => request<{ id: string }>('/api/scripts', { method: 'POST', body: JSON.stringify(body) }),
  updateScript: (
    id: string,
    body: {
      name?: string;
      description?: string;
      source?: string;
      visibility?: ScriptVisibility;
      license?: string;
      priceCents?: number;
    },
  ) => request<{ ok: true }>(`/api/scripts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteScript: (id: string) => request<{ ok: true }>(`/api/scripts/${id}`, { method: 'DELETE' }),
  installScript: (id: string) =>
    request<{ downloads: number; source: string | null; locked: boolean }>(
      `/api/scripts/${id}/install`,
      { method: 'POST' },
    ),
  favoriteScript: (id: string) =>
    request<{ favorited: boolean }>(`/api/scripts/${id}/favorite`, { method: 'POST' }),
  unfavoriteScript: (id: string) =>
    request<{ favorited: boolean }>(`/api/scripts/${id}/favorite`, { method: 'DELETE' }),
  spaces: (
    params: {
      q?: string;
      owner?: string;
      free?: boolean;
      subscribed?: boolean;
      sort?: SpacesSort;
      limit?: number;
    } = {},
  ) => request<{ spaces: SpaceRow[] }>(`/api/spaces${queryString(params)}`),
  space: (id: string) => request<{ space: SpaceDetail }>(`/api/spaces/${id}`),
  createSpace: (body: {
    name: string;
    description?: string;
    visibility?: SpaceVisibility;
    priceCents?: number;
    currency?: string;
  }) => request<{ id: string }>('/api/spaces', { method: 'POST', body: JSON.stringify(body) }),
  updateSpace: (
    id: string,
    body: {
      name?: string;
      description?: string;
      visibility?: SpaceVisibility;
      priceCents?: number;
    },
  ) => request<{ ok: true }>(`/api/spaces/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSpace: (id: string) => request<{ ok: true }>(`/api/spaces/${id}`, { method: 'DELETE' }),
  subscribeSpace: (id: string) =>
    request<{ subscribed: boolean }>(`/api/spaces/${id}/subscribe`, { method: 'POST' }),
  unsubscribeSpace: (id: string) =>
    request<{ subscribed: boolean }>(`/api/spaces/${id}/subscribe`, { method: 'DELETE' }),
  spacePosts: (id: string) => request<{ posts: SpacePost[] }>(`/api/spaces/${id}/posts`),
  addSpacePost: (id: string, body: { title?: string; body: string }) =>
    request<{ id: string }>(`/api/spaces/${id}/posts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteSpacePost: (id: string, postId: string) =>
    request<{ ok: true }>(`/api/spaces/${id}/posts/${postId}`, { method: 'DELETE' }),
};

export type {
  Bar,
  DomBook,
  IndicatorDef,
  IndicatorOutput,
  Watchlist,
  WatchlistItem,
  Plan,
  AlertRow,
  PortfolioRow,
  PaperAccount,
  BrokerConnection,
  DividendEvent,
  NewsArticle,
  EarningsEvent,
  EconomicEvent,
  FundamentalSnapshot,
  MacroSeriesObservation,
  ScreenerPreset,
  ScreenerResult,
  YieldCurvePoint,
  IdeaRow,
};

export { ApiError };
