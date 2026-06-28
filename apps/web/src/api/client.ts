import type {
  AuthResponse,
  Bar,
  DomBook,
  IndicatorDef,
  IndicatorOutput,
  PatternCatalogEntry,
  PatternMatch,
  ChartPatternCatalogEntry,
  ChartPatternMatch,
  VolumeProfile,
  TpoProfile,
  Ichimoku,
  StrategyConfig,
  StrategyDef,
  StrategyType,
  BacktestSettings,
  BacktestResult,
  OptimizeObjective,
  OptimizeResult,
  WalkForwardResult,
  PivotMethod,
  PivotPeriod,
  PivotPoints,
  LayoutRow,
  Symbol,
  User,
  Watchlist,
  WatchlistItem,
  AlertRow,
  AlertHistoryRow,
  PortfolioRow,
  PortfolioHolding,
  PortfolioMetrics,
  PortfolioAnalytics,
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
  ScreenerMetricDef,
  YieldCurvePoint,
  AlertCondition,
  OptionPriceResult,
  StrategyAnalysis,
  StrategyTemplate,
} from './types';
import type { LayoutConfig } from '@tv/layout-sync';
import type { Drawing } from '@tv/drawing-tools';
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
  // Default 8s timeout. The Vite dev proxy occasionally hangs on the very
  // first request after a client-side route transition (resolves only on
  // F5). Aborting forces React Query to surface the error and stop the
  // query from staying in `pending` forever.
  const timeoutMs = (init as { timeoutMs?: number } | undefined)?.timeoutMs ?? 8_000;
  const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
  const res = await fetch(path, {
    ...init,
    signal,
    credentials: 'include',
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
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
  signup: (body: { email: string; password: string; displayName?: string }) =>
    request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  devOwnerLogin: () => request<AuthResponse>('/auth/dev-owner', { method: 'POST' }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User } | { user: null }>('/auth/me'),
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
      source?: 'barstore' | 'exchange';
      asOf?: number | null;
      fresh?: boolean;
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
      source?: string;
    }>(`/api/chart/dom?symbol=${encodeURIComponent(symbol)}&levels=${levels}`),
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
  chartPatterns: () => request<{ patterns: ChartPatternCatalogEntry[] }>('/api/chart-patterns'),
  scanChartPatterns: (symbol: string, interval = '1h', limit = 500, ids?: string[]) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      matches: ChartPatternMatch[];
    }>('/api/chart-patterns/scan', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, ...(ids ? { ids } : {}) }),
    }),
  volumeProfile: (symbol: string, interval = '1h', limit = 500, bins = 24) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      profile: VolumeProfile;
    }>('/api/volume-profile', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, bins }),
    }),
  tpoProfile: (symbol: string, interval = '1h', limit = 240, bins = 24, barsPerPeriod = 10) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      profile: TpoProfile;
    }>('/api/tpo-profile', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, bins, barsPerPeriod }),
    }),
  ichimoku: (
    symbol: string,
    interval = '1h',
    limit = 500,
    tenkan = 9,
    kijun = 26,
    senkou = 52,
    displacement = 26,
  ) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      ichimoku: Ichimoku;
    }>('/api/ichimoku', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, tenkan, kijun, senkou, displacement }),
    }),
  pivotPoints: (
    symbol: string,
    interval = '1h',
    method: PivotMethod = 'standard',
    period: PivotPeriod = 'D',
    limit = 500,
  ) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      pivots: PivotPoints;
    }>('/api/pivot-points', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, method, period, limit }),
    }),
  backtestStrategies: () => request<{ strategies: StrategyDef[] }>('/api/backtest/strategies'),
  backtestOptimize: (
    symbol: string,
    interval: string,
    type: StrategyType,
    paramGrid: Record<string, number[]>,
    settings: Partial<BacktestSettings> = {},
    objective: OptimizeObjective = 'netProfitPct',
    limit = 1000,
  ) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      optimization: OptimizeResult;
    }>('/api/backtest/optimize', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, type, paramGrid, settings, objective }),
    }),
  backtestWalkForward: (
    symbol: string,
    interval: string,
    type: StrategyType,
    paramGrid: Record<string, number[]>,
    settings: Partial<BacktestSettings> = {},
    objective: OptimizeObjective = 'netProfitPct',
    inSampleBars = 300,
    outOfSampleBars = 100,
    limit = 1500,
  ) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      walkForward: WalkForwardResult;
    }>('/api/backtest/walkforward', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        interval,
        limit,
        type,
        paramGrid,
        settings,
        objective,
        inSampleBars,
        outOfSampleBars,
      }),
    }),
  backtest: (
    symbol: string,
    interval: string,
    strategy: StrategyConfig,
    settings: Partial<BacktestSettings> = {},
    limit = 1000,
  ) =>
    request<{
      symbol: { id: string; ticker: string; exchange: string };
      interval: string;
      bars: number;
      result: BacktestResult;
    }>('/api/backtest', {
      method: 'POST',
      body: JSON.stringify({ symbol, interval, limit, strategy, settings }),
    }),
  backtestPine: (body: {
    symbol: string;
    interval: string;
    source: string;
    inputs?: Record<string, number | boolean | string>;
    signalPlot?: string;
    settings?: Partial<BacktestSettings>;
    limit?: number;
  }) =>
    request<
      | {
          ok: true;
          symbol: { id: string; ticker: string; exchange: string };
          interval: string;
          bars: number;
          signalPlot: string;
          plots: string[];
          result: BacktestResult;
        }
      | { ok: false; error: { kind: string; message: string } }
    >('/api/backtest/pine', { method: 'POST', body: JSON.stringify(body) }),
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
  drawings: (symbol: string, interval: string, scope?: string) =>
    request<{ drawings: Drawing[] }>(
      `/api/drawings?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`,
    ),
  saveDrawings: (symbol: string, interval: string, drawings: Drawing[], scope?: string) =>
    request<{ ok: true }>(
      `/api/drawings?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`,
      { method: 'PUT', body: JSON.stringify({ drawings }) },
    ),
  batchDrawings: (
    symbol: string,
    interval: string,
    body: { upsert?: Drawing[]; deleteIds?: string[] },
    scope?: string,
  ) =>
    request<{ ok: true }>(
      `/api/drawings/batch?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
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
    condition: AlertCondition;
    channels: string[];
    webhookUrl?: string;
    active?: boolean;
  }) => request<{ id: string }>('/api/alerts', { method: 'POST', body: JSON.stringify(body) }),
  updateAlert: (id: string, body: { active?: boolean; webhookUrl?: string | null }) =>
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
  portfolioAnalytics: (id: string) =>
    request<{ analytics: PortfolioAnalytics }>(`/api/portfolios/${id}/analytics`),
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
    request<{ results: ScreenerResult[] }>('/api/screener', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  screenerMetrics: () => request<{ metrics: ScreenerMetricDef[] }>('/api/screener/metrics'),
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
};

export type {
  Bar,
  DomBook,
  IndicatorDef,
  IndicatorOutput,
  Watchlist,
  WatchlistItem,
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
  ScreenerMetricDef,
  YieldCurvePoint,
};

export { ApiError };
