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

export type NewsProviderId = 'mock';

export const createNewsProvider = (providerId: string): NewsProvider => {
  if (providerId === 'mock') return new MockNewsProvider();
  throw new NewsProviderError(providerId, 'Unsupported news provider');
};
