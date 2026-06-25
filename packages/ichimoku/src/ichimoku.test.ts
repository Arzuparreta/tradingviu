import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { computeIchimoku } from './ichimoku.js';
import { IchimokuSchema } from './types.js';

const T0 = 1_000_000_000;
const STEP = 60;
let t = T0;
const bar = (high: number, low: number, close: number): Bar => {
  const time = t;
  t += STEP;
  return { time, open: low, high, low, close, volume: 1 };
};
const at = (n: number) => T0 + n * STEP;

// A fixed 6-bar fixture with hand-computed expectations below.
const fixture = (): Bar[] => {
  t = T0;
  return [
    bar(10, 8, 9), // 0
    bar(12, 9, 11), // 1
    bar(11, 7, 8), // 2
    bar(14, 10, 13), // 3
    bar(13, 11, 12), // 4
    bar(15, 12, 14), // 5
  ];
};

describe('computeIchimoku', () => {
  const opts = { tenkan: 2, kijun: 3, senkou: 4, displacement: 2 } as const;

  test('empty input yields empty arrays with the requested params', () => {
    const r = computeIchimoku([], opts);
    expect(r.tenkan).toHaveLength(0);
    expect(r.cloud).toHaveLength(0);
    expect(r.params).toEqual({ tenkan: 2, kijun: 3, senkou: 4, displacement: 2 });
    expect(IchimokuSchema.parse(r)).toBeTruthy();
  });

  test('displacement defaults to the kijun period', () => {
    const r = computeIchimoku(fixture()); // 9 / 26 / 52
    expect(r.params).toEqual({ tenkan: 9, kijun: 26, senkou: 52, displacement: 26 });
    // not enough bars for any value
    expect(r.tenkan).toHaveLength(0);
    expect(r.cloud).toHaveLength(0);
  });

  test('Tenkan-sen is the midpoint of the last `tenkan` highs/lows', () => {
    const r = computeIchimoku(fixture(), opts);
    expect(r.tenkan).toHaveLength(5);
    expect(r.tenkan[0]).toEqual({ time: at(1), value: 10 }); // bars 0–1: (12+8)/2
    expect(r.tenkan.at(-1)).toEqual({ time: at(5), value: 13 }); // bars 4–5: (15+11)/2
  });

  test('Kijun-sen is the midpoint of the last `kijun` highs/lows', () => {
    const r = computeIchimoku(fixture(), opts);
    expect(r.kijun).toHaveLength(4);
    expect(r.kijun[0]).toEqual({ time: at(2), value: 9.5 }); // bars 0–2: (12+7)/2
    expect(r.kijun.at(-1)).toEqual({ time: at(5), value: 12.5 }); // bars 3–5: (15+10)/2
  });

  test('Senkou spans are displaced forward, synthesizing times past the end', () => {
    const r = computeIchimoku(fixture(), opts);
    // Span A = (Tenkan + Kijun)/2, defined once both exist (i ≥ 2).
    expect(r.senkouA).toHaveLength(4);
    expect(r.senkouA[0]).toEqual({ time: at(4), value: 9.5 }); // i=2 → bar 4
    expect(r.senkouA[1]).toEqual({ time: at(5), value: 10.5 }); // i=3 → bar 5
    expect(r.senkouA[2]).toEqual({ time: at(6), value: 11.25 }); // i=4 → synthesized
    expect(r.senkouA[3]).toEqual({ time: at(7), value: 12.75 }); // i=5 → synthesized
    // Span B = midpoint of last `senkou` highs/lows (i ≥ 3).
    expect(r.senkouB).toHaveLength(3);
    expect(r.senkouB[0]).toEqual({ time: at(5), value: 10.5 });
    expect(r.senkouB.at(-1)).toEqual({ time: at(7), value: 11 });
  });

  test('cloud aligns both spans on the same times with a bullish flag', () => {
    const r = computeIchimoku(fixture(), opts);
    expect(r.cloud).toHaveLength(3);
    expect(r.cloud[0]).toEqual({ time: at(5), spanA: 10.5, spanB: 10.5, bullish: true });
    expect(r.cloud.at(-1)).toEqual({ time: at(7), spanA: 12.75, spanB: 11, bullish: true });
    // every cloud time carries a matching span A and span B
    for (const c of r.cloud) {
      expect(r.senkouA.find((p) => p.time === c.time)?.value).toBe(c.spanA);
      expect(r.senkouB.find((p) => p.time === c.time)?.value).toBe(c.spanB);
    }
  });

  test('Chikou span is the close plotted `displacement` bars back', () => {
    const r = computeIchimoku(fixture(), opts);
    expect(r.chikou).toHaveLength(4);
    expect(r.chikou[0]).toEqual({ time: at(0), value: 8 }); // bar 2 close at bar 0 time
    expect(r.chikou.at(-1)).toEqual({ time: at(3), value: 14 }); // bar 5 close at bar 3 time
  });

  test('a bearish cloud sets bullish=false', () => {
    // Falling structure → Span B (slower) above Span A (faster).
    t = T0;
    const bars: Bar[] = [
      bar(20, 18, 19),
      bar(19, 17, 18),
      bar(18, 16, 17),
      bar(17, 15, 16),
      bar(16, 14, 15),
      bar(15, 13, 14),
    ];
    const r = computeIchimoku(bars, opts);
    expect(r.cloud.length).toBeGreaterThan(0);
    expect(r.cloud.every((c) => c.bullish === c.spanA >= c.spanB)).toBe(true);
    expect(r.cloud.some((c) => !c.bullish)).toBe(true);
  });

  test('is deterministic and schema-valid', () => {
    const a = computeIchimoku(fixture(), opts);
    const b = computeIchimoku(fixture(), opts);
    expect(a).toEqual(b);
    expect(() => IchimokuSchema.parse(a)).not.toThrow();
  });
});
