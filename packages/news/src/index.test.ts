import { describe, expect, test } from 'bun:test';
import { MockNewsProvider, fetchNormalizedNews, normalizeNewsArticle } from './index.js';

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
});
