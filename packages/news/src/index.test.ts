import { describe, expect, test } from 'bun:test';
import {
  FinnhubNewsProvider,
  MockNewsProvider,
  NewsApiProvider,
  createNewsProvider,
  fetchNormalizedNews,
  normalizeNewsArticle,
} from './index.js';

const unix = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('news provider normalization', () => {
  test('normalizes provider payloads and deduplicates symbols', () => {
    const fetchedAt = new Date('2026-06-24T12:00:00.000Z');
    const article = normalizeNewsArticle(
      { id: 'mock', displayName: 'Mockwire' },
      {
        url: 'https://example.com/news/1',
        title: ' Desk note ',
        symbols: ['aapl', 'AAPL', ' msft '],
        sentiment: 'positive',
        publishedAt: '2026-06-24T09:00:00.000Z',
      },
      fetchedAt,
    );

    expect(article.source).toBe('Mockwire');
    expect(article.symbols).toEqual(['AAPL', 'MSFT']);
    expect(article.fetchedAt).toEqual(fetchedAt);
  });

  test('mock provider filters by symbol and date deterministically', async () => {
    const provider = new MockNewsProvider();
    const articles = await fetchNormalizedNews(provider, {
      symbols: ['BTCUSDT'],
      from: '2026-06-24T00:00:00.000Z',
      limit: 10,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]?.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(articles[0]?.source).toBe('Tradingviu Mockwire');
  });

  test('NewsAPI provider tags per-symbol articles and merges duplicates', async () => {
    const calls: string[] = [];
    const fetcher = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const q = url.searchParams.get('q') ?? '';
      calls.push(q);
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('demo-key');
      const shared = {
        source: { name: 'Reuters' },
        url: 'https://example.com/news/shared',
        title: 'Megacap tech rallies into the close',
        description: 'Index heavyweights led the tape higher.',
        publishedAt: '2026-06-24T15:00:00.000Z',
      };
      if (q === 'AAPL') {
        return jsonResponse({
          status: 'ok',
          articles: [
            shared,
            {
              source: { name: 'Bloomberg' },
              url: 'https://example.com/news/aapl-only',
              title: 'Apple guidance in focus',
              content: 'Desk chatter centered on services margins.',
              publishedAt: '2026-06-24T16:00:00.000Z',
            },
          ],
        });
      }
      if (q === 'MSFT') {
        return jsonResponse({ status: 'ok', articles: [shared] });
      }
      return jsonResponse({ status: 'ok', articles: [] });
    };

    const provider = new NewsApiProvider('demo-key', 'https://newsapi.example.test', fetcher);
    const articles = await fetchNormalizedNews(provider, { symbols: ['aapl', 'MSFT'], limit: 10 });

    expect(calls).toEqual(['AAPL', 'MSFT']);
    expect(articles).toHaveLength(2);
    const shared = articles.find((a) => a.url === 'https://example.com/news/shared');
    expect(shared?.symbols).toEqual(['AAPL', 'MSFT']);
    expect(shared?.source).toBe('Reuters');
    const appleOnly = articles.find((a) => a.url === 'https://example.com/news/aapl-only');
    expect(appleOnly?.symbols).toEqual(['AAPL']);
    expect(appleOnly?.body).toBe('Desk chatter centered on services margins.');
  });

  test('Finnhub provider fetches company news per symbol and parses unix timestamps', async () => {
    const calls: Array<{ path: string; symbol: string | null; from: string | null; token: string | null }> =
      [];
    const fetcher = async (input: URL | RequestInfo): Promise<Response> => {
      const url = new URL(String(input));
      calls.push({
        path: url.pathname,
        symbol: url.searchParams.get('symbol'),
        from: url.searchParams.get('from'),
        token: url.searchParams.get('token'),
      });
      const symbol = url.searchParams.get('symbol');
      if (symbol === 'AAPL') {
        return jsonResponse([
          {
            datetime: unix('2026-06-24T08:00:00.000Z'),
            headline: 'Apple ships new chip',
            summary: 'Margins in focus.',
            source: 'Finnhub Wire',
            url: 'https://example.com/finnhub/aapl',
            related: 'AAPL',
          },
          {
            datetime: unix('2026-06-24T10:00:00.000Z'),
            headline: 'Suppliers rally on demand',
            summary: '',
            source: 'Finnhub Wire',
            url: 'https://example.com/finnhub/shared',
            related: 'AAPL,MSFT',
          },
        ]);
      }
      if (symbol === 'MSFT') {
        return jsonResponse([
          {
            datetime: unix('2026-06-24T10:00:00.000Z'),
            headline: 'Suppliers rally on demand',
            source: 'Finnhub Wire',
            url: 'https://example.com/finnhub/shared',
            related: 'MSFT',
          },
        ]);
      }
      return jsonResponse([]);
    };

    const provider = new FinnhubNewsProvider('demo-key', 'https://finnhub.example.test', fetcher);
    const articles = await fetchNormalizedNews(provider, {
      symbols: ['aapl', 'MSFT'],
      from: '2026-06-24T00:00:00.000Z',
      to: '2026-06-25T00:00:00.000Z',
      limit: 10,
    });

    expect(calls.map((c) => c.path)).toEqual(['/api/v1/company-news', '/api/v1/company-news']);
    expect(calls[0]?.symbol).toBe('AAPL');
    expect(calls[0]?.from).toBe('2026-06-24');
    expect(calls[0]?.token).toBe('demo-key');
    const shared = articles.find((a) => a.url === 'https://example.com/finnhub/shared');
    expect(shared?.symbols).toEqual(['AAPL', 'MSFT']);
    const apple = articles.find((a) => a.url === 'https://example.com/finnhub/aapl');
    expect(apple?.body).toBe('Margins in focus.');
    expect(apple?.source).toBe('Finnhub Wire');
  });

  test('Finnhub provider falls back to general market news when no symbols are given', async () => {
    const paths: string[] = [];
    const fetcher = async (input: URL | RequestInfo): Promise<Response> => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}?category=${url.searchParams.get('category') ?? ''}`);
      return jsonResponse([
        {
          datetime: unix('2026-06-24T12:00:00.000Z'),
          headline: 'Markets steady ahead of data',
          summary: 'Breadth improved across sectors.',
          source: 'Finnhub',
          url: 'https://example.com/finnhub/general',
          related: 'SPY,QQQ',
        },
      ]);
    };

    const provider = new FinnhubNewsProvider('demo-key', 'https://finnhub.example.test', fetcher);
    const articles = await fetchNormalizedNews(provider, { limit: 10 });

    expect(paths).toEqual(['/api/v1/news?category=general']);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.symbols).toEqual(['QQQ', 'SPY']);
    expect(articles[0]?.source).toBe('Finnhub');
  });

  test('createNewsProvider builds the finnhub provider', () => {
    const provider = createNewsProvider('finnhub', { finnhubKey: 'demo-key' });
    expect(provider.id).toBe('finnhub');
    expect(provider.displayName).toBe('Finnhub');
  });
});
