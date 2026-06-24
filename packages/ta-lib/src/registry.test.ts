import { describe, it, expect } from 'bun:test';
import { compute, all, find } from '../src/index.js';
import type { Bar } from '@tv/data-types';

const sampleBars: Bar[] = (() => {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 200; i++) {
    const open = price;
    const close = open + (Math.sin(i / 7) * 2) + (Math.random() - 0.5);
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    const volume = 1000 + Math.random() * 500;
    bars.push({ time: 1000 + i * 60, open, high, low, close, volume });
    price = close;
  }
  return bars;
})();

describe('indicators', () => {
  it('lists all indicators', () => {
    const list = all();
    expect(list.length).toBeGreaterThanOrEqual(30);
    const names = list.map((i) => i.name);
    expect(names).toContain('SMA');
    expect(names).toContain('EMA');
    expect(names).toContain('RSI');
    expect(names).toContain('MACD');
    expect(names).toContain('BB');
    expect(names).toContain('VWAP');
    expect(names).toContain('ADX');
  });

  it('finds indicators by id', () => {
    expect(find('sma')?.name).toBe('SMA');
    expect(find('SMA')?.name).toBe('SMA');
    expect(find('rsi')?.name).toBe('RSI');
    expect(find('unknown')).toBeUndefined();
  });

  it('computes SMA correctly', () => {
    const result = compute('sma', sampleBars, { length: 5 });
    expect(result.points.length).toBe(sampleBars.length - 5 + 1);
    expect(result.overlay).toBe(true);
    const last = result.points[result.points.length - 1]!;
    const expected = sampleBars.slice(-5).reduce((s, b) => s + b.close, 0) / 5;
    expect(Math.abs(last.value - expected)).toBeLessThan(0.001);
  });

  it('computes RSI in 0-100 range', () => {
    const result = compute('rsi', sampleBars, { length: 14 });
    for (const p of result.points) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it('computes MACD with signal and histogram', () => {
    const result = compute('macd', sampleBars, { fast: 12, slow: 26, signal: 9 });
    expect(result.lines.length).toBe(2);
    expect(result.histogram?.length).toBeGreaterThan(0);
  });

  it('computes Bollinger Bands', () => {
    const result = compute('bb', sampleBars, { length: 20, mult: 2 });
    expect(result.bands?.length).toBeGreaterThan(0);
    const last = result.bands![result.bands!.length - 1]!;
    expect(last.upper).toBeGreaterThan(last.middle);
    expect(last.middle).toBeGreaterThan(last.lower);
  });

  it('uses defaults when params are missing', () => {
    const rsi = compute('rsi', sampleBars);
    expect(rsi.points.length).toBeGreaterThan(0);
    const sma = compute('sma', sampleBars);
    expect(sma.points.length).toBeGreaterThan(0);
  });

  it('validates params with Zod', () => {
    expect(() => compute('sma', sampleBars, { length: 10000 })).toThrow();
  });
});
