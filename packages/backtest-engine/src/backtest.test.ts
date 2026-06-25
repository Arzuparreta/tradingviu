import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import { runBacktest } from './backtest.js';
import { sma, rsi, generateSignals, strategyCatalog } from './strategies.js';
import { BacktestResultSchema } from './types.js';

let t = 1_700_000_000;
const bar = (open: number, high: number, low: number, close: number): Bar => {
  t += 60;
  return { time: t, open, high, low, close, volume: 1 };
};
const reset = () => {
  t = 1_700_000_000;
};

describe('indicator helpers', () => {
  test('sma is null until the window fills', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  test('rsi is 100 with only gains and null before warmup', () => {
    const r = rsi([1, 2, 3, 4, 5, 6], 5);
    expect(r[4]).toBeNull();
    expect(r[5]).toBe(100);
  });
});

describe('generateSignals', () => {
  test('maCross goes long after the fast SMA crosses above the slow', () => {
    reset();
    const bars = [bar(100, 100, 100, 100), bar(100, 100, 100, 100), bar(105, 110, 100, 110)];
    const sig = generateSignals(bars, { type: 'maCross', params: { fast: 1, slow: 2 } });
    expect(sig[0]).toBe(0);
    expect(sig[2]).toBe(1);
  });

  test('donchianBreakout goes long on a close above the prior-N high', () => {
    reset();
    const bars = [
      bar(9, 10, 8, 9),
      bar(9, 10, 8, 9),
      bar(9, 10, 8, 9),
      bar(9, 12, 8, 11),
    ];
    const sig = generateSignals(bars, { type: 'donchianBreakout', params: { period: 2 } });
    expect(sig[2]).toBe(0);
    expect(sig[3]).toBe(1);
  });
});

describe('runBacktest', () => {
  test('empty input yields a zeroed, schema-valid result', () => {
    const r = runBacktest([], { type: 'maCross', params: {} });
    expect(r.trades).toHaveLength(0);
    expect(r.equityCurve).toHaveLength(0);
    expect(r.stats.finalEquity).toBe(10_000);
    expect(r.stats.profitFactor).toBeNull();
    expect(() => BacktestResultSchema.parse(r)).not.toThrow();
  });

  test('a single long trade prices out exactly (no fees/slippage)', () => {
    reset();
    // Signal flips long at bar 2 → entry at bar 3's open (110), held to the end,
    // force-closed at bar 3's close (121).
    const bars = [
      bar(100, 100, 100, 100),
      bar(100, 100, 100, 100),
      bar(105, 110, 100, 110),
      bar(110, 121, 110, 121),
    ];
    const r = runBacktest(
      bars,
      { type: 'maCross', params: { fast: 1, slow: 2 } },
      { initialCapital: 10_000, feeBps: 0, slippageBps: 0, positionPct: 1, allowShort: false },
    );

    expect(r.trades).toHaveLength(1);
    const trade = r.trades[0]!;
    expect(trade.side).toBe('long');
    expect(trade.entryPrice).toBeCloseTo(110, 6);
    expect(trade.exitPrice).toBeCloseTo(121, 6);
    expect(trade.exitReason).toBe('end');
    expect(trade.pnl).toBeCloseTo(1000, 4); // (10000/110) * (121 - 110)
    expect(trade.pnlPct).toBeCloseTo(0.1, 6);

    expect(r.stats.netProfit).toBeCloseTo(1000, 4);
    expect(r.stats.finalEquity).toBeCloseTo(11_000, 4);
    expect(r.stats.winRate).toBe(1);
    expect(r.stats.longTrades).toBe(1);
    expect(r.stats.buyHoldReturnPct).toBeCloseTo(0.21, 6); // 121/100 - 1
    expect(r.equityCurve).toHaveLength(bars.length);
  });

  test('fees and slippage reduce the net profit', () => {
    reset();
    const bars = [
      bar(100, 100, 100, 100),
      bar(100, 100, 100, 100),
      bar(105, 110, 100, 110),
      bar(110, 121, 110, 121),
    ];
    const cfg = { type: 'maCross', params: { fast: 1, slow: 2 } } as const;
    const clean = runBacktest(bars, cfg, { feeBps: 0, slippageBps: 0 });
    reset();
    const costly = runBacktest(bars, cfg, { feeBps: 10, slippageBps: 10 });
    expect(costly.stats.netProfit).toBeLessThan(clean.stats.netProfit);
  });

  test('net profit equals the sum of trade P&L and is deterministic', () => {
    reset();
    const bars: Bar[] = [];
    // A deterministic zig-zag so several trades open and close.
    const prices = [100, 102, 105, 103, 108, 112, 109, 104, 101, 106, 110, 113, 108, 100];
    for (const p of prices) bars.push(bar(p, p + 1, p - 1, p));
    const cfg = { type: 'maCross', params: { fast: 2, slow: 4 } } as const;
    const a = runBacktest(bars, cfg, { feeBps: 5, slippageBps: 2, allowShort: true });
    reset();
    const b = runBacktest(bars, cfg, { feeBps: 5, slippageBps: 2, allowShort: true });

    expect(a).toEqual(b); // deterministic
    const tradeSum = a.trades.reduce((s, tr) => s + tr.pnl, 0);
    expect(a.stats.netProfit).toBeCloseTo(tradeSum, 6);
    expect(a.stats.winningTrades + a.stats.losingTrades).toBeLessThanOrEqual(a.stats.totalTrades);
    expect(() => BacktestResultSchema.parse(a)).not.toThrow();
  });

  test('shorts are suppressed when allowShort is false', () => {
    reset();
    const bars: Bar[] = [];
    const prices = [110, 108, 106, 104, 102, 100, 98, 96];
    for (const p of prices) bars.push(bar(p, p + 1, p - 1, p));
    const cfg = { type: 'maCross', params: { fast: 1, slow: 2 } } as const;
    const r = runBacktest(bars, cfg, { allowShort: false });
    expect(r.stats.shortTrades).toBe(0);
  });

  test('catalog exposes the three strategies with params', () => {
    expect(strategyCatalog.map((s) => s.type)).toEqual([
      'maCross',
      'rsiReversal',
      'donchianBreakout',
    ]);
    expect(strategyCatalog.every((s) => s.params.length >= 1)).toBe(true);
  });
});
