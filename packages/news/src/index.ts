import {
  NewsIngestQuerySchema,
  NewsProviderArticleSchema,
  NormalizedNewsArticleSchema,
  type NewsIngestQuery,
  type NewsProviderArticle,
  type NormalizedNewsArticle,
} from '@tv/core';

export interface NewsProviderHealth {
  readonly ok: boolean;
  readonly checkedAt: Date;
  readonly message?: string;
}

export interface NewsProvider {
  readonly id: string;
  readonly displayName: string;
  fetchNews(query: NewsIngestQuery): Promise<readonly NewsProviderArticle[]>;
  healthCheck(): Promise<NewsProviderHealth>;
}

export class NewsProviderError extends Error {
  public override readonly name = 'NewsProviderError';
  public override readonly cause?: unknown;
  public readonly provider: string;

  public constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    if (cause !== undefined) this.cause = cause;
  }
}

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

const uniqueSymbols = (symbols: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);
    if (normalized.length > 0) seen.add(normalized);
  }
  return [...seen].sort();
};

const hasSymbolIntersection = (
  articleSymbols: readonly string[],
  querySymbols: readonly string[],
): boolean => {
  if (querySymbols.length === 0) return true;
  const wanted = new Set(querySymbols.map(normalizeSymbol));
  return articleSymbols.some((symbol) => wanted.has(normalizeSymbol(symbol)));
};

export const normalizeNewsArticle = (
  provider: Pick<NewsProvider, 'id' | 'displayName'>,
  article: unknown,
  fetchedAt: Date,
): NormalizedNewsArticle => {
  const parsed = NewsProviderArticleSchema.parse(article);
  const normalized = {
    source: parsed.source ?? provider.displayName,
    url: parsed.url,
    title: parsed.title,
    symbols: uniqueSymbols(parsed.symbols),
    publishedAt: parsed.publishedAt,
    fetchedAt,
    ...(parsed.body ? { body: parsed.body } : {}),
    ...(parsed.sentiment ? { sentiment: parsed.sentiment } : {}),
  };
  return NormalizedNewsArticleSchema.parse(normalized);
};

export const fetchNormalizedNews = async (
  provider: NewsProvider,
  queryInput: unknown,
  fetchedAt = new Date(),
): Promise<readonly NormalizedNewsArticle[]> => {
  const query = NewsIngestQuerySchema.parse(queryInput);
  const rawArticles = await provider.fetchNews(query);
  return rawArticles.map((article) => normalizeNewsArticle(provider, article, fetchedAt));
};

const mockArticles: readonly NewsProviderArticle[] = [
  {
    source: 'Tradingviu Mockwire',
    url: 'https://example.com/tradingviu/mockwire/apple-ai-refresh',
    title: 'Apple suppliers rise as desk chatter turns to AI device refresh',
    body: 'Options volume clustered near weekly calls while equity desks tracked stronger supplier breadth.',
    symbols: ['AAPL'],
    sentiment: 'positive',
    publishedAt: new Date('2026-06-24T08:30:00.000Z'),
  },
  {
    source: 'Tradingviu Mockwire',
    url: 'https://example.com/tradingviu/mockwire/rates-pressure-megacap',
    title: 'Megacap software names trade mixed as yields edge higher',
    body: 'Macro-sensitive growth shares opened unevenly with portfolio hedges concentrated in index futures.',
    symbols: ['MSFT', 'AAPL'],
    sentiment: 'neutral',
    publishedAt: new Date('2026-06-24T10:15:00.000Z'),
  },
  {
    source: 'Tradingviu Mockwire',
    url: 'https://example.com/tradingviu/mockwire/crypto-liquidity-asia',
    title: 'Crypto liquidity improves in Asia session after range breakout',
    body: 'Bitcoin and Ethereum books showed tighter spreads as derivatives funding normalized.',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    sentiment: 'positive',
    publishedAt: new Date('2026-06-24T11:45:00.000Z'),
  },
];

export class MockNewsProvider implements NewsProvider {
  public readonly id = 'mock';
  public readonly displayName = 'Tradingviu Mockwire';
  private readonly articles: readonly NewsProviderArticle[];

  public constructor(articles: readonly NewsProviderArticle[] = mockArticles) {
    this.articles = articles.map((article) => NewsProviderArticleSchema.parse(article));
  }

  public async fetchNews(queryInput: NewsIngestQuery): Promise<readonly NewsProviderArticle[]> {
    const query = NewsIngestQuerySchema.parse(queryInput);
    const articles = this.articles
      .filter((article) => hasSymbolIntersection(article.symbols, query.symbols))
      .filter((article) => (query.from ? article.publishedAt >= query.from : true))
      .filter((article) => (query.to ? article.publishedAt <= query.to : true))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, query.limit);
    return articles;
  }

  public async healthCheck(): Promise<NewsProviderHealth> {
    return { ok: true, checkedAt: new Date('2026-06-24T00:00:00.000Z') };
  }
}

type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const textOrUndefined = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const parseNewsApiArticle = (
  value: unknown,
  symbols: readonly string[],
): NewsProviderArticle | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const url = textOrUndefined(record.url);
  const title = textOrUndefined(record.title);
  const publishedAtRaw = textOrUndefined(record.publishedAt);
  if (!url || !title || !publishedAtRaw) return undefined;
  const publishedAt = new Date(publishedAtRaw);
  if (Number.isNaN(publishedAt.getTime())) return undefined;
  const source = asRecord(record.source);
  const sourceName = source ? textOrUndefined(source.name) : undefined;
  const body = textOrUndefined(record.description) ?? textOrUndefined(record.content);
  return {
    url,
    title,
    symbols: [...symbols],
    publishedAt,
    ...(sourceName ? { source: sourceName } : {}),
    ...(body ? { body } : {}),
  };
};

export class NewsApiProvider implements NewsProvider {
  public readonly id = 'newsapi';
  public readonly displayName = 'NewsAPI';

  public constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://newsapi.org',
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!apiKey.trim()) throw new NewsProviderError(this.id, 'NEWSAPI_KEY is required');
  }

  public async fetchNews(queryInput: NewsIngestQuery): Promise<readonly NewsProviderArticle[]> {
    const query = NewsIngestQuerySchema.parse(queryInput);
    const symbols = uniqueSymbols(query.symbols);
    const byUrl = new Map<string, NewsProviderArticle>();

    if (symbols.length === 0) {
      for (const article of await this.fetchEverything('stocks OR markets OR earnings', [], query)) {
        byUrl.set(article.url, article);
      }
    } else {
      for (const symbol of symbols) {
        for (const article of await this.fetchEverything(symbol, [symbol], query)) {
          const existing = byUrl.get(article.url);
          byUrl.set(
            article.url,
            existing
              ? { ...existing, symbols: uniqueSymbols([...existing.symbols, ...article.symbols]) }
              : article,
          );
        }
      }
    }

    return [...byUrl.values()]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, query.limit);
  }

  public async healthCheck(): Promise<NewsProviderHealth> {
    return { ok: true, checkedAt: new Date() };
  }

  private async fetchEverything(
    q: string,
    symbols: readonly string[],
    query: NewsIngestQuery,
  ): Promise<readonly NewsProviderArticle[]> {
    const url = new URL('/v2/everything', this.baseUrl);
    url.searchParams.set('q', q);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(Math.min(query.limit, 100)));
    if (query.from) url.searchParams.set('from', query.from.toISOString());
    if (query.to) url.searchParams.set('to', query.to.toISOString());

    const response = await this.fetcher(url, { headers: { 'X-Api-Key': this.apiKey } });
    if (!response.ok) {
      throw new NewsProviderError(this.id, `HTTP ${response.status} for /v2/everything`);
    }
    const payload = (await response.json()) as { articles?: unknown };
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    return articles
      .map((article) => parseNewsApiArticle(article, symbols))
      .filter((article): article is NewsProviderArticle => article !== undefined);
  }
}

export type NewsProviderId = 'mock' | 'newsapi';

export const createNewsProvider = (
  providerId: string,
  options: { readonly newsApiKey?: string } = {},
): NewsProvider => {
  if (providerId === 'mock') return new MockNewsProvider();
  if (providerId === 'newsapi') return new NewsApiProvider(options.newsApiKey ?? '');
  throw new NewsProviderError(providerId, 'Unsupported news provider');
};
