import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { computeVolumeProfile } from './profile.js';
import { buyFraction, overlap } from './helpers.js';
import { VolumeProfileSchema } from './types.js';

let t = 1_700_000_000;
const bar = (low: number, high: number, close: number, volume: number, open = close): Bar => ({
  time: (t += 60),
  open,
  high,
  low,
  close,
  volume,
});

/** A zero-volume bar only used to pin the profile's price extent. */
const edge = (price: number): Bar => bar(price, price, price, 0);

describe('helpers', () => {
  test('buyFraction reflects close position in range', () => {
    expect(buyFraction(bar(10, 20, 20, 1))).toBeCloseTo(1, 10); // close at high
    expect(buyFraction(bar(10, 20, 10, 1))).toBeCloseTo(0, 10); // close at low
    expect(buyFraction(bar(10, 20, 15, 1))).toBeCloseTo(0.5, 10); // mid
  });

  test('buyFraction on a flat bar uses open→close direction', () => {
    expect(buyFraction(bar(10, 10, 10, 1, 9))).toBe(1); // close >= open
    expect(buyFraction(bar(10, 10, 10, 1, 11))).toBe(0); // close < open
  });

  test('overlap is the intersection length, never negative', () => {
    expect(overlap(0, 10, 5, 15)).toBe(5);
    expect(overlap(0, 10, 20, 30)).toBe(0);
    expect(overlap(2, 8, 0, 10)).toBe(6);
  });
});

describe('computeVolumeProfile', () => {
  test('empty input yields an empty profile', () => {
    const p = computeVolumeProfile([]);
    expect(p.bins).toBe(0);
    expect(p.rows).toHaveLength(0);
    expect(p.pocIndex).toBe(-1);
    expect(p.totalVolume).toBe(0);
    expect(VolumeProfileSchema.parse(p)).toBeTruthy();
  });

  test('distributes all volume and conserves the total', () => {
    const bars: Bar[] = [
      edge(100),
      edge(110),
      bar(104.2, 104.8, 104.5, 100),
      bar(101.2, 101.8, 101.5, 50),
      bar(106, 107, 107, 100), // closes at the high → all buying
    ];
    const p = computeVolumeProfile(bars, { bins: 10 });

    expect(p.bins).toBe(10);
    expect(p.binSize).toBeCloseTo(1, 10);
    expect(p.priceLow).toBe(100);
    expect(p.priceHigh).toBe(110);
    expect(p.totalVolume).toBeCloseTo(250, 6);

    // buy + sell must equal the total, and the rows must re-sum to it.
    expect(p.buyVolume + p.sellVolume).toBeCloseTo(p.totalVolume, 6);
    const rowSum = p.rows.reduce((s, r) => s + r.volume, 0);
    expect(rowSum).toBeCloseTo(p.totalVolume, 6);
    expect(p.delta).toBeCloseTo(p.buyVolume - p.sellVolume, 6);
  });

  test('POC is the highest-volume price level', () => {
    const bars: Bar[] = [
      edge(100),
      edge(110),
      bar(104.2, 104.8, 104.5, 100),
      bar(104.2, 104.8, 104.5, 100),
      bar(104.2, 104.8, 104.5, 100), // 300 in bin 4
      bar(101.2, 101.8, 101.5, 50), // 50 in bin 1
    ];
    const p = computeVolumeProfile(bars, { bins: 10 });
    expect(p.pocIndex).toBe(4);
    expect(p.poc).toBeCloseTo(104.5, 6);
    expect(p.rows[4]!.isPoc).toBe(true);
  });

  test('a bar closing at its high is counted as all buying', () => {
    const p = computeVolumeProfile([edge(100), edge(110), bar(106, 107, 107, 100)], {
      bins: 10,
    });
    expect(p.buyVolume).toBeCloseTo(100, 6);
    expect(p.sellVolume).toBeCloseTo(0, 6);
    expect(p.rows[6]!.delta).toBeCloseTo(100, 6);
  });

  test('value area grows toward the heavier neighbour to hit the target', () => {
    const bars: Bar[] = [
      edge(0),
      edge(4),
      bar(0.2, 0.8, 0.5, 10), // bin 0
      bar(1.2, 1.8, 1.5, 40), // bin 1 (POC)
      bar(2.2, 2.8, 2.5, 30), // bin 2
      bar(3.2, 3.8, 3.5, 20), // bin 3
    ];
    const p = computeVolumeProfile(bars, { bins: 4, valueAreaPct: 0.7 });
    expect(p.totalVolume).toBeCloseTo(100, 6);
    expect(p.pocIndex).toBe(1);
    // POC (bin 1, 40) expands up to bin 2 (30) before bin 0 (10): VA = bins 1–2.
    expect(p.val).toBeCloseTo(1, 6);
    expect(p.vah).toBeCloseTo(3, 6);
    expect(p.valueAreaVolume).toBeCloseTo(70, 6);
    expect(p.valueAreaPct).toBeCloseTo(0.7, 6);
    expect(p.rows.filter((r) => r.inValueArea).map((r) => r.index)).toEqual([1, 2]);
  });

  test('a single flat price collapses to one bin', () => {
    const bars: Bar[] = [bar(50, 50, 50, 100), bar(50, 50, 50, 40)];
    const p = computeVolumeProfile(bars, { bins: 10 });
    expect(p.bins).toBe(1);
    expect(p.binSize).toBe(0);
    expect(p.totalVolume).toBeCloseTo(140, 6);
    expect(p.poc).toBe(50);
    expect(p.val).toBe(50);
    expect(p.vah).toBe(50);
  });

  test('is deterministic across repeated runs', () => {
    const bars: Bar[] = [edge(100), edge(110), bar(104.2, 104.8, 104.5, 100)];
    const a = computeVolumeProfile(bars, { bins: 12 });
    const b = computeVolumeProfile(bars, { bins: 12 });
    expect(a).toEqual(b);
  });

  test('output validates against the schema', () => {
    const bars: Bar[] = [edge(100), edge(110), bar(104.2, 104.8, 104.5, 100)];
    const p = computeVolumeProfile(bars, { bins: 8 });
    expect(() => VolumeProfileSchema.parse(p)).not.toThrow();
  });
});
