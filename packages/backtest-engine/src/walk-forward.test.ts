import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { walkForward } from './walk-forward.js';
import { optimize } from './optimize.js';
import { WalkForwardResultSchema } from './types.js';

let t = 1_700_000_000;
const bar = (price: number): Bar => {
  t += 60;
  return { time: t, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
};
const makeBars = (n: number): Bar[] => {
  t = 1_700_000_000;
  const out: Bar[] = [];
  // A deterministic oscillating series with drift.
  for (let i = 0; i < n; i++) out.push(bar(100 + 10 * Math.sin(i / 2) + i * 0.5));
  return out;
};

const grid = { fast: [2, 3], slow: [4, 6] };

describe('walkForward', () => {
  test('produces contiguous, non-overlapping folds', () => {
    const bars = makeBars(20);
    const r = walkForward(bars, 'maCross', grid, { feeBps: 0 }, { inSampleBars: 6, outOfSampleBars: 3 });
    // starts at 0, 3, 6, 9, 12 → 5 folds
    expect(r.aggregate.foldCount).toBe(5);
    expect(r.folds[0]!.inStart).toBe(bars[0]!.time);
    expect(r.folds[0]!.outStart).toBe(bars[6]!.time); // OOS begins right after the IS window
    expect(r.folds[1]!.inStart).toBe(bars[3]!.time); // window slides by the OOS size
    expect(() => WalkForwardResultSchema.parse(r)).not.toThrow();
  });

  test('each fold carries grid params, IS/OOS scores and OOS stats', () => {
    const r = walkForward(makeBars(20), 'maCross', grid, {}, { inSampleBars: 6, outOfSampleBars: 3 });
    for (const f of r.folds) {
      expect(grid.fast).toContain(f.bestParams.fast!);
      expect(grid.slow).toContain(f.bestParams.slow!);
      expect(Number.isFinite(f.inSampleScore)).toBe(true);
      expect(Number.isFinite(f.oosScore)).toBe(true);
      expect(f.oos.totalTrades).toBeGreaterThanOrEqual(0);
    }
  });

  test("a fold's best params match a direct optimize of its in-sample window", () => {
    const bars = makeBars(20);
    const r = walkForward(bars, 'maCross', grid, { feeBps: 0 }, { inSampleBars: 6, outOfSampleBars: 3 });
    const inBars = bars.slice(0, 6);
    const opt = optimize(inBars, 'maCross', grid, { feeBps: 0 }, { topN: 1 });
    expect(r.folds[0]!.bestParams).toEqual(opt.results[0]!.params);
  });

  test('aggregate compounds OOS returns and counts profitable folds', () => {
    const r = walkForward(makeBars(24), 'maCross', grid, {}, { inSampleBars: 6, outOfSampleBars: 3 });
    const manual =
      r.folds.reduce((acc, f) => acc * (1 + f.oos.netProfitPct), 1) - 1;
    expect(r.aggregate.oosReturnCompounded).toBeCloseTo(manual, 9);
    expect(r.aggregate.profitableFolds).toBe(
      r.folds.filter((f) => f.oos.netProfitPct > 0).length,
    );
    expect(r.aggregate.profitableFoldPct).toBeCloseTo(
      r.aggregate.profitableFolds / r.aggregate.foldCount,
      9,
    );
  });

  test('not enough bars yields zero folds', () => {
    const r = walkForward(makeBars(6), 'maCross', grid, {}, { inSampleBars: 6, outOfSampleBars: 3 });
    expect(r.aggregate.foldCount).toBe(0);
    expect(r.aggregate.walkForwardEfficiency).toBe(0);
  });

  test('is deterministic', () => {
    const a = walkForward(makeBars(20), 'maCross', grid, {}, { inSampleBars: 6, outOfSampleBars: 3 });
    const b = walkForward(makeBars(20), 'maCross', grid, {}, { inSampleBars: 6, outOfSampleBars: 3 });
    expect(a).toEqual(b);
  });
});
