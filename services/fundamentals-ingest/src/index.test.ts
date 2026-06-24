import { describe, expect, test } from 'bun:test';
import { buildQueryFromEnv } from './index.js';

describe('fundamentals ingest env query', () => {
  test('parses symbol list and numeric limit', () => {
    const query = buildQueryFromEnv({
      FUNDAMENTALS_INGEST_SYMBOLS: 'AAPL, msft ,,',
      FUNDAMENTALS_INGEST_LIMIT: '25',
    } as NodeJS.ProcessEnv);

    expect(query.symbols).toEqual(['AAPL', 'MSFT']);
    expect(query.limit).toBe(25);
    expect(query.fiscalPeriod).toBe('ttm');
  });
});
