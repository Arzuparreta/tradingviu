import { describe, expect, test } from 'bun:test';
import { readScreenerMetrics, screenerMetricKeys } from './index.js';

describe('screener metrics', () => {
  test('keeps only finite supported metadata metrics', () => {
    const metrics = readScreenerMetrics({
      marketCap: 3_000_000,
      peRatio: 24.5,
      eps: Number.NaN,
      unknown: 12,
    });

    expect(metrics).toEqual({ marketCap: 3_000_000, peRatio: 24.5 });
  });

  test('exposes the initial slice-6 metric catalog', () => {
    expect(screenerMetricKeys).toContain('marketCap');
    expect(screenerMetricKeys).toContain('dividendYield');
    expect(screenerMetricKeys).toContain('revenueGrowth');
  });
});
