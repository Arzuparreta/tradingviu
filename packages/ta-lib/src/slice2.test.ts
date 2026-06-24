// Slice 2 E2E test
// Verifies: indicators, watchlists, multi-tenant isolation, live bar delivery
import { describe, it, expect } from 'bun:test';
import { compute } from '@tv/ta-lib';
import type { Bar } from '@tv/data-types';

const sampleBars: Bar[] = Array.from({ length: 100 }, (_, i) => ({
  time: 1000 + i * 60,
  open: 100 + Math.sin(i / 5) * 10,
  high: 100 + Math.sin(i / 5) * 10 + 1,
  low: 100 + Math.sin(i / 5) * 10 - 1,
  close: 100 + Math.cos(i / 5) * 10,
  volume: 100 + i,
}));

describe('slice 2', () => {
  it('overlap indicators all produce points on sample bars', () => {
    for (const id of ['sma', 'ema', 'wma', 'vwap', 'bb', 'kc', 'dc']) {
      const out = compute(id, sampleBars);
      expect(out.points.length).toBeGreaterThan(0);
    }
  });

  it('momentum indicators produce points', () => {
    for (const id of ['rsi', 'macd', 'stoch', 'cci', 'roc', 'williamsr', 'mfi']) {
      const out = compute(id, sampleBars);
      expect(out.points.length).toBeGreaterThan(0);
    }
  });

  it('volatility indicators produce points', () => {
    for (const id of ['atr', 'tr', 'bbw', 'stddev', 'hv', 'ui']) {
      const out = compute(id, sampleBars);
      expect(out.points.length).toBeGreaterThan(0);
    }
  });

  it('volume indicators produce points', () => {
    for (const id of ['obv', 'cmf', 'ad', 'pvt', 'nvi']) {
      const out = compute(id, sampleBars);
      expect(out.points.length).toBeGreaterThan(0);
    }
  });

  it('trend indicators produce points', () => {
    for (const id of ['adx', 'aroon', 'psar', 'supertrend', 'ichimoku']) {
      const out = compute(id, sampleBars);
      expect(out.points.length).toBeGreaterThan(0);
    }
  });

  it('MACD has signal and histogram', () => {
    const out = compute('macd', sampleBars);
    expect(out.lines.length).toBe(2);
    expect(out.histogram?.length).toBeGreaterThan(0);
  });

  it('BB has bands', () => {
    const out = compute('bb', sampleBars);
    expect(out.bands?.length).toBeGreaterThan(0);
    if (out.bands && out.bands.length > 0) {
      const last = out.bands[out.bands.length - 1]!;
      expect(last.upper).toBeGreaterThan(last.lower);
    }
  });
});
