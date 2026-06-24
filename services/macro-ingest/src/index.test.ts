import { describe, expect, test } from 'bun:test';
import { buildQueryFromEnv } from './index.js';

describe('macro ingest env query', () => {
  test('parses country, range, and limit', () => {
    const query = buildQueryFromEnv({
      MACRO_INGEST_COUNTRY: 'us',
      MACRO_INGEST_FROM: '2026-01-01T00:00:00.000Z',
      MACRO_INGEST_TO: '2026-06-30T00:00:00.000Z',
      MACRO_INGEST_LIMIT: '25',
    } as NodeJS.ProcessEnv);

    expect(query.country).toBe('us');
    expect(query.from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(query.to).toEqual(new Date('2026-06-30T00:00:00.000Z'));
    expect(query.limit).toBe(25);
  });
});
