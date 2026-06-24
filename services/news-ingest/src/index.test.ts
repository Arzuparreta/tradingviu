import { describe, expect, test } from 'bun:test';
import { buildQueryFromEnv } from './index.js';

describe('news ingest env query', () => {
  test('parses symbol list and numeric limit', () => {
    const query = buildQueryFromEnv({
      NEWS_INGEST_SYMBOLS: 'AAPL, msft ,, BTCUSDT',
      NEWS_INGEST_LIMIT: '25',
    } as NodeJS.ProcessEnv);

    expect(query.symbols).toEqual(['AAPL', 'msft', 'BTCUSDT']);
    expect(query.limit).toBe(25);
  });
});
