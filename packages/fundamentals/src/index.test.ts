import { describe, expect, test } from 'bun:test';
import {
  MockFundamentalsProvider,
  fetchNormalizedFundamentals,
  normalizeFundamentalSnapshot,
} from './index.js';

describe('fundamentals provider normalization', () => {
  test('normalizes symbols and provider source', () => {
    const fetchedAt = new Date('2026-06-24T12:00:00.000Z');
    const snapshot = normalizeFundamentalSnapshot(
      { id: 'mock', displayName: 'Mock Fundamentals' },
      {
        symbol: ' aapl ',
        fiscalPeriod: 'ttm',
        periodEnd: '2026-06-30T00:00:00.000Z',
        currency: 'USD',
        marketCap: 3_000_000_000_000,
        peRatio: 30,
      },
      fetchedAt,
    );

    expect(snapshot.symbol).toBe('AAPL');
    expect(snapshot.source).toBe('Mock Fundamentals');
    expect(snapshot.fetchedAt).toEqual(fetchedAt);
  });

  test('mock provider filters by symbol deterministically', async () => {
    const provider = new MockFundamentalsProvider();
    const snapshots = await fetchNormalizedFundamentals(provider, {
      symbols: ['msft'],
      fiscalPeriod: 'ttm',
      limit: 10,
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.symbol).toBe('MSFT');
    expect(snapshots[0]?.source).toBe('Tradingviu Fundamental Mock');
  });
});
