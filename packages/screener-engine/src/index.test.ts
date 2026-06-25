import { describe, expect, test } from 'bun:test';
import {
  buildScreenerFilters,
  isScreenerMetric,
  metricExpr,
  readScreenerMetrics,
  screenerMetricCatalog,
  screenerMetricKeys,
  screenerOrderBy,
} from './index.js';
import { ScreenerQuerySchema } from '@tv/core';

describe('readScreenerMetrics', () => {
  test('keeps only finite numeric catalog metrics', () => {
    const metrics = readScreenerMetrics({
      marketCap: 3_000_000,
      peRatio: 24.5,
      eps: Number.NaN,
      unknown: 12, // not in the catalog
    });
    expect(metrics).toEqual({ marketCap: 3_000_000, peRatio: 24.5 });
  });

  test('reads metadata-backed metrics, coercing numeric strings', () => {
    const metrics = readScreenerMetrics({ priceToBook: '8.2', grossMargin: 0.43, junk: 'n/a' });
    expect(metrics).toEqual({ priceToBook: 8.2, grossMargin: 0.43 });
  });

  test('merges column-backed and metadata-backed sources', () => {
    const merged = {
      ...readScreenerMetrics({ marketCap: 100, peRatio: 20 }),
      ...readScreenerMetrics({ priceToBook: 5, debtToEquity: 0.4 }),
    };
    expect(merged).toEqual({ marketCap: 100, peRatio: 20, priceToBook: 5, debtToEquity: 0.4 });
  });
});

describe('metric catalog', () => {
  test('is large, grouped, and has unique keys', () => {
    expect(screenerMetricCatalog.length).toBeGreaterThan(70);
    const keys = new Set(screenerMetricKeys);
    expect(keys.size).toBe(screenerMetricKeys.length); // no duplicates
    expect(new Set(screenerMetricCatalog.map((d) => d.group)).size).toBeGreaterThanOrEqual(8);
  });

  test('flags the eleven column-backed metrics as stored', () => {
    const stored = screenerMetricCatalog.filter((d) => d.stored).map((d) => d.key).sort();
    expect(stored).toEqual(
      [
        '52WeekHigh',
        '52WeekLow',
        'beta',
        'dividendYield',
        'earningsGrowth',
        'eps',
        'marketCap',
        'peRatio',
        'revenue',
        'revenueGrowth',
        'roe',
      ].sort(),
    );
  });

  test('isScreenerMetric accepts catalog keys and rejects others', () => {
    expect(isScreenerMetric('priceToBook')).toBe(true);
    expect(isScreenerMetric('marketCap')).toBe(true);
    expect(isScreenerMetric('not_a_metric')).toBe(false);
  });
});

describe('metricExpr', () => {
  test('returns an expression for column- and metadata-backed metrics', () => {
    expect(metricExpr('marketCap')).not.toBeNull();
    expect(metricExpr('priceToBook')).not.toBeNull();
  });
  test('returns null for unknown keys (never injected into SQL)', () => {
    expect(metricExpr('drop table')).toBeNull();
    expect(metricExpr('__proto__')).toBeNull();
  });
});

describe('buildScreenerFilters', () => {
  test('always restricts to active symbols by default', () => {
    const q = ScreenerQuerySchema.parse({});
    expect(buildScreenerFilters(q).length).toBe(1); // active = true
  });

  test('builds one clause per filter bound and skips unknown metrics', () => {
    const q = ScreenerQuerySchema.parse({
      active: false,
      filters: [
        { key: 'marketCap', min: 1_000_000 }, // 1 clause
        { key: 'peRatio', min: 5, max: 30 }, // 2 clauses
        { key: 'priceToBook', max: 10 }, // 1 clause
        { key: 'bogus', min: 1 }, // skipped
      ],
    });
    expect(buildScreenerFilters(q).length).toBe(4);
  });

  test('adds categorical clauses for sector/industry/exchange', () => {
    const q = ScreenerQuerySchema.parse({ sector: 'Tech', industry: 'Software', exchange: 'NASDAQ' });
    // active(1) + sector + industry + exchange = 4
    expect(buildScreenerFilters(q).length).toBe(4);
  });
});

describe('screenerOrderBy', () => {
  test('produces an order expression for any catalog key or column field', () => {
    expect(screenerOrderBy('marketCap', 'desc')).toBeTruthy();
    expect(screenerOrderBy('priceToBook', 'asc')).toBeTruthy();
    expect(screenerOrderBy('ticker', 'asc')).toBeTruthy();
    expect(screenerOrderBy('unknown_field', 'desc')).toBeTruthy(); // falls back safely
  });
});
