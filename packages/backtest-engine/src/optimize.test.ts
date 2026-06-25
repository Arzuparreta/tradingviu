import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { optimize } from './optimize.js';
import { runBacktest } from './backtest.js';
import { OptimizeResultSchema } from './types.js';

let t = 1_700_000_000;
const bar = (price: number): Bar => {
  t += 60;
  return { time: t, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
};
const makeBars = (): Bar[] => {
  t = 1_700_000_000;
  const prices = [100, 102, 105, 103, 108, 112, 109, 104, 101, 106, 110, 113, 108, 100, 104, 109];
  return prices.map(bar);
};

describe('optimize', () => {
  test('evaluates the full cartesian grid and is schema-valid', () => {
    const bars = makeBars();
    const r = optimize(bars, 'maCross', { fast: [3, 5], slow: [10, 20] }, { feeBps: 0 });
    expect(r.evaluated).toBe(4); // 2 × 2
    expect(r.truncated).toBe(false);
    expect(r.results.length).toBe(4);
    expect(r.objective).toBe('netProfitPct');
    expect(() => OptimizeResultSchema.parse(r)).not.toThrow();
  });

  test('ranks best-first by the chosen objective', () => {
    const bars = makeBars();
    const r = optimize(bars, 'maCross', { fast: [2, 3, 5], slow: [8, 12, 20] }, { feeBps: 0 });
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i - 1]!.stats.netProfitPct).toBeGreaterThanOrEqual(
        r.results[i]!.stats.netProfitPct,
      );
    }
    // The top row matches a direct backtest of those params.
    const top = r.results[0]!;
    const direct = runBacktest(bars, { type: 'maCross', params: top.params }, { feeBps: 0 });
    expect(top.stats.netProfitPct).toBeCloseTo(direct.stats.netProfitPct, 10);
  });

  test('maxDrawdownPct objective prefers the smallest drawdown', () => {
    const bars = makeBars();
    const r = optimize(
      bars,
      'maCross',
      { fast: [2, 3, 5], slow: [8, 12, 20] },
      { feeBps: 0 },
      { objective: 'maxDrawdownPct' },
    );
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i - 1]!.stats.maxDrawdownPct).toBeLessThanOrEqual(
        r.results[i]!.stats.maxDrawdownPct,
      );
    }
  });

  test('caps evaluation at maxCombos and flags truncation', () => {
    const bars = makeBars();
    const r = optimize(
      bars,
      'maCross',
      { fast: [2, 3, 4, 5], slow: [8, 10, 12, 20] },
      {},
      { maxCombos: 5, topN: 3 },
    );
    expect(r.evaluated).toBe(5); // 16 combos capped to 5
    expect(r.truncated).toBe(true);
    expect(r.results.length).toBe(3); // topN
  });

  test('is deterministic across runs', () => {
    const a = optimize(makeBars(), 'donchianBreakout', { period: [5, 10, 15] }, { feeBps: 2 });
    const b = optimize(makeBars(), 'donchianBreakout', { period: [5, 10, 15] }, { feeBps: 2 });
    expect(a).toEqual(b);
  });
});
