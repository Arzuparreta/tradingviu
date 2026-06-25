import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { computeTpoProfile } from './profile.js';
import { periodLabel } from './helpers.js';
import { TpoProfileSchema } from './types.js';

let t = 1_700_000_000;
const bar = (low: number, high: number): Bar => {
  t += 60;
  return { time: t, open: low, high, low, close: high, volume: 1 };
};

describe('periodLabel', () => {
  test('follows the Market Profile A–Z, a–z, wrap convention', () => {
    expect(periodLabel(0)).toBe('A');
    expect(periodLabel(25)).toBe('Z');
    expect(periodLabel(26)).toBe('a');
    expect(periodLabel(51)).toBe('z');
    expect(periodLabel(52)).toBe('A'); // wraps
  });
});

describe('computeTpoProfile', () => {
  test('empty input yields an empty profile', () => {
    const p = computeTpoProfile([]);
    expect(p.bins).toBe(0);
    expect(p.rows).toHaveLength(0);
    expect(p.pocIndex).toBe(-1);
    expect(p.totalTpo).toBe(0);
    expect(p.periodCount).toBe(0);
    expect(TpoProfileSchema.parse(p)).toBeTruthy();
  });

  test('counts one TPO letter per period per row it spans', () => {
    const bars: Bar[] = [
      bar(1.2, 1.8), // A → row 1
      bar(1.3, 2.7), // B → rows 1, 2
      bar(0, 4), // C → rows 0–3 (sets the [0, 4] extent)
      bar(1.1, 1.9), // D → row 1
    ];
    const p = computeTpoProfile(bars, { bins: 4, valueAreaPct: 0.7 });

    expect(p.bins).toBe(4);
    expect(p.binSize).toBeCloseTo(1, 10);
    expect(p.priceLow).toBe(0);
    expect(p.priceHigh).toBe(4);
    expect(p.periodCount).toBe(4);
    expect(p.barCount).toBe(4);

    expect(p.rows.map((r) => r.count)).toEqual([1, 4, 2, 1]);
    expect(p.rows.map((r) => r.letters)).toEqual(['C', 'ABCD', 'BC', 'C']);

    // total TPOs equals the sum of row counts.
    expect(p.totalTpo).toBe(8);
    expect(p.rows.reduce((s, r) => s + r.count, 0)).toBe(p.totalTpo);
  });

  test('POC is the most-printed price level', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const p = computeTpoProfile(bars, { bins: 4 });
    expect(p.pocIndex).toBe(1);
    expect(p.poc).toBeCloseTo(1.5, 6);
    expect(p.rows[1]!.isPoc).toBe(true);
  });

  test('value area grows toward the heavier neighbour to hit the target', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const p = computeTpoProfile(bars, { bins: 4, valueAreaPct: 0.7 });
    // POC (row 1, 4 TPOs) expands up to row 2 (2) before row 0 (1): VA = rows 1–2.
    expect(p.val).toBeCloseTo(1, 6);
    expect(p.vah).toBeCloseTo(3, 6);
    expect(p.valueAreaTpo).toBe(6);
    expect(p.valueAreaPct).toBeCloseTo(0.75, 6);
    expect(p.rows.filter((r) => r.inValueArea).map((r) => r.index)).toEqual([1, 2]);
  });

  test('flags single prints and computes the initial balance', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const p = computeTpoProfile(bars, { bins: 4 });
    // rows 0 and 3 are touched by exactly one period.
    expect(p.singlePrintCount).toBe(2);
    expect(p.rows.filter((r) => r.isSinglePrint).map((r) => r.index)).toEqual([0, 3]);
    // IB = range of the first two periods: [1.2, 1.8] ∪ [1.3, 2.7] = [1.2, 2.7].
    expect(p.initialBalanceLow).toBeCloseTo(1.2, 6);
    expect(p.initialBalanceHigh).toBeCloseTo(2.7, 6);
  });

  test('barsPerPeriod merges consecutive bars into one letter', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const p = computeTpoProfile(bars, { bins: 4, barsPerPeriod: 2 });
    // period A = bars 0–1 merged → [1.2, 2.7] (rows 1–2)
    // period B = bars 2–3 merged → [0, 4] (rows 0–3)
    expect(p.periodCount).toBe(2);
    expect(p.barCount).toBe(4);
    expect(p.rows.map((r) => r.count)).toEqual([1, 2, 2, 1]);
    expect(p.rows.map((r) => r.letters)).toEqual(['B', 'AB', 'AB', 'B']);
    expect(p.totalTpo).toBe(6);
    expect(p.pocIndex).toBe(1); // ties resolve to the lower row index
  });

  test('a single flat price collapses to one row', () => {
    const p = computeTpoProfile([bar(50, 50), bar(50, 50)], { bins: 10 });
    expect(p.bins).toBe(1);
    expect(p.binSize).toBe(0);
    expect(p.periodCount).toBe(2);
    expect(p.totalTpo).toBe(2);
    expect(p.poc).toBe(50);
    expect(p.val).toBe(50);
    expect(p.vah).toBe(50);
    expect(p.initialBalanceLow).toBe(50);
    expect(p.initialBalanceHigh).toBe(50);
  });

  test('is deterministic across repeated runs', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const a = computeTpoProfile(bars, { bins: 12, barsPerPeriod: 1 });
    const b = computeTpoProfile(bars, { bins: 12, barsPerPeriod: 1 });
    expect(a).toEqual(b);
  });

  test('output validates against the schema', () => {
    const bars: Bar[] = [bar(1.2, 1.8), bar(1.3, 2.7), bar(0, 4), bar(1.1, 1.9)];
    const p = computeTpoProfile(bars, { bins: 8 });
    expect(() => TpoProfileSchema.parse(p)).not.toThrow();
  });
});
