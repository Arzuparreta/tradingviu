import { describe, expect, test } from 'bun:test';
import { buildQueryFromEnv } from './index.js';

describe('calendar ingest env query', () => {
  test('parses symbols, country, range, and limit', () => {
    const query = buildQueryFromEnv({
      CALENDAR_INGEST_SYMBOLS: 'aapl, msft',
      CALENDAR_INGEST_COUNTRY: 'US',
      CALENDAR_INGEST_FROM: '2026-07-01T00:00:00.000Z',
      CALENDAR_INGEST_TO: '2026-07-31T00:00:00.000Z',
      CALENDAR_INGEST_LIMIT: '25',
    } as NodeJS.ProcessEnv);

    expect(query.symbols).toEqual(['AAPL', 'MSFT']);
    expect(query.country).toBe('US');
    expect(query.from).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(query.to).toEqual(new Date('2026-07-31T00:00:00.000Z'));
    expect(query.limit).toBe(25);
  });

  test('defaults to empty symbols and no country', () => {
    const query = buildQueryFromEnv({} as NodeJS.ProcessEnv);

    expect(query.symbols).toEqual([]);
    expect(query.country).toBeUndefined();
    expect(query.limit).toBe(250);
  });
});
