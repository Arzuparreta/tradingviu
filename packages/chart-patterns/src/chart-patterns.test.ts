import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { findPivots, alternatePivots } from './pivots.js';
import {
  CHART_PATTERNS,
  allChartPatterns,
  findChartPattern,
  scanChartPatterns,
} from './registry.js';

let clock = 1_700_000_000;
const mk = (price: number): Bar => ({
  time: (clock += 60),
  open: price,
  high: price + 0.05,
  low: price - 0.05,
  close: price,
  volume: 0,
});

/**
 * Build bars that pass linearly through `anchors`, inserting `gap` interpolated
 * bars between each pair. With gap >= 3 every anchor becomes a clean swing
 * pivot (strictly the local extreme within the lookback window).
 */
const zigzag = (anchors: number[], gap = 4): Bar[] => {
  const prices: number[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    prices.push(a);
    for (let s = 1; s <= gap; s++) prices.push(a + ((b - a) * s) / (gap + 1));
  }
  prices.push(anchors[anchors.length - 1]!);
  return prices.map(mk);
};

const ids = (bars: Bar[]): string[] => scanChartPatterns(bars).map((m) => m.id);

describe('pivots', () => {
  test('finds alternating swing highs and lows', () => {
    const bars = zigzag([100, 120, 100, 120, 100]);
    const pivots = alternatePivots(findPivots(bars));
    expect(pivots.length).toBeGreaterThanOrEqual(3);
    // strictly alternating
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i]!.kind).not.toBe(pivots[i - 1]!.kind);
    }
    expect(pivots.some((p) => p.kind === 'high' && p.price > 119)).toBe(true);
    expect(pivots.some((p) => p.kind === 'low' && p.price < 101)).toBe(true);
  });

  test('alternatePivots keeps the more extreme of a same-kind run', () => {
    const merged = alternatePivots([
      { index: 1, time: 1, price: 100, kind: 'high' },
      { index: 2, time: 2, price: 105, kind: 'high' },
      { index: 3, time: 3, price: 90, kind: 'low' },
    ]);
    expect(merged.length).toBe(2);
    expect(merged[0]!.price).toBe(105);
  });
});

describe('reversal patterns', () => {
  test('double top confirms on a break below the trough', () => {
    const m = scanChartPatterns(zigzag([100, 120, 110, 120, 100])).find(
      (x) => x.id === 'double-top',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bearish');
    expect(m!.breakoutLevel).toBeCloseTo(110, 0);
    expect(m!.target).toBeLessThan(m!.breakoutLevel);
    expect(m!.endIndex).toBeGreaterThan(m!.startIndex);
  });

  test('double bottom confirms on a break above the peak', () => {
    const m = scanChartPatterns(zigzag([110, 90, 100, 90, 110])).find(
      (x) => x.id === 'double-bottom',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bullish');
    expect(m!.target).toBeGreaterThan(m!.breakoutLevel);
  });

  test('triple top', () => {
    expect(ids(zigzag([100, 120, 110, 120, 110, 120, 100]))).toContain('triple-top');
  });

  test('triple bottom', () => {
    expect(ids(zigzag([110, 90, 100, 90, 100, 90, 110]))).toContain('triple-bottom');
  });

  test('head and shoulders', () => {
    const m = scanChartPatterns(zigzag([100, 115, 108, 125, 108, 115, 95])).find(
      (x) => x.id === 'head-and-shoulders',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bearish');
    expect(m!.points.find((p) => p.role === 'head')!.price).toBeCloseTo(125, 0);
  });

  test('inverse head and shoulders', () => {
    const m = scanChartPatterns(zigzag([100, 85, 92, 75, 92, 85, 105])).find(
      (x) => x.id === 'inverse-head-and-shoulders',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bullish');
  });
});

describe('continuation patterns', () => {
  test('ascending triangle: flat highs, rising lows, upside break', () => {
    const m = scanChartPatterns(zigzag([90, 120, 100, 120, 108, 130])).find(
      (x) => x.id === 'ascending-triangle',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bullish');
    expect(m!.target).toBeGreaterThan(m!.breakoutLevel);
  });

  test('descending triangle: flat lows, falling highs, downside break', () => {
    const m = scanChartPatterns(zigzag([130, 100, 125, 100, 115, 90])).find(
      (x) => x.id === 'descending-triangle',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bearish');
  });

  test('symmetrical triangle: converging lines', () => {
    const m = scanChartPatterns(zigzag([110, 130, 90, 120, 100, 135])).find(
      (x) => x.id === 'symmetrical-triangle',
    );
    expect(m).toBeDefined();
    expect(['bullish', 'bearish']).toContain(m!.direction);
  });

  test('rising wedge breaks down', () => {
    const m = scanChartPatterns(zigzag([100, 120, 105, 128, 118, 124, 100])).find(
      (x) => x.id === 'rising-wedge',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bearish');
  });

  test('falling wedge breaks up', () => {
    const m = scanChartPatterns(zigzag([80, 120, 95, 108, 88, 120])).find(
      (x) => x.id === 'falling-wedge',
    );
    expect(m).toBeDefined();
    expect(m!.direction).toBe('bullish');
  });
});

describe('registry', () => {
  test('catalog covers every detector with unique ids', () => {
    const entries = allChartPatterns();
    expect(entries.length).toBe(CHART_PATTERNS.length);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(findChartPattern('double-top')?.name).toBe('Double Top');
    expect(findChartPattern('nope')).toBeUndefined();
  });

  test('scan honors the id filter', () => {
    const bars = zigzag([100, 120, 110, 120, 100]);
    const only = scanChartPatterns(bars, { ids: ['double-top'] });
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((m) => m.id === 'double-top')).toBe(true);
  });

  test('matches are returned in breakout order', () => {
    const bars = zigzag([100, 120, 110, 120, 110, 120, 100]);
    const matches = scanChartPatterns(bars);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.endIndex).toBeGreaterThanOrEqual(matches[i - 1]!.endIndex);
    }
  });

  test('confidence is bounded in [0, 1]', () => {
    const matches = scanChartPatterns(zigzag([100, 120, 110, 120, 100]));
    for (const m of matches) {
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('flat noise produces no patterns', () => {
    const flat = Array.from({ length: 40 }, () => mk(100));
    expect(scanChartPatterns(flat)).toEqual([]);
  });
});
