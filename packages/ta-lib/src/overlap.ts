import type { Bar } from '@tv/data-types';
import type { IndicatorOutput, IndicatorPoint } from './types.js';

const COLORS = {
  sma: '#3b82f6',
  ema: '#f59e0b',
  wma: '#a855f7',
  vwap: '#06b6d4',
  bb: '#94a3b8',
  keltner: '#f97316',
  donchian: '#64748b',
  baseline: '#10b981',
};

export const sma = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let sum = 0;
  const queue: number[] = [];
  for (const bar of bars) {
    queue.push(bar.close);
    sum += bar.close;
    if (queue.length > length) sum -= queue.shift()!;
    if (queue.length === length) points.push({ time: bar.time, value: sum / length });
  }
  return { name: 'SMA', overlay: true, lines: [{ key: 'sma', color: COLORS.sma, type: 'line' }], points };
};

export const ema = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  const k = 2 / (length + 1);
  let prev: number | null = null;
  for (const bar of bars) {
    if (prev === null) {
      if (points.length === 0 && bars.indexOf(bar) >= length - 1) {
        const slice = bars.slice(bars.indexOf(bar) - length + 1, bars.indexOf(bar) + 1);
        prev = slice.reduce((s, b) => s + b.close, 0) / length;
        points.push({ time: bar.time, value: prev });
      }
      continue;
    }
    prev = bar.close * k + prev * (1 - k);
    points.push({ time: bar.time, value: prev });
  }
  return { name: 'EMA', overlay: true, lines: [{ key: 'ema', color: COLORS.ema, type: 'line' }], points };
};

export const wma = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < bars.length; i++) {
    let num = 0;
    for (let j = 0; j < length; j++) num += bars[i - j]!.close * (length - j);
    points.push({ time: bars[i]!.time, value: num / denom });
  }
  return { name: 'WMA', overlay: true, lines: [{ key: 'wma', color: COLORS.wma, type: 'line' }], points };
};

export const vwap = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    cumPV += typical * bar.volume;
    cumV += bar.volume;
    if (cumV > 0) points.push({ time: bar.time, value: cumPV / cumV });
  }
  return { name: 'VWAP', overlay: true, lines: [{ key: 'vwap', color: COLORS.vwap, type: 'line' }], points };
};

export const bollingerBands = (bars: ReadonlyArray<Bar>, length: number, mult: number): IndicatorOutput => {
  const bands: { time: number; upper: number; middle: number; lower: number }[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const mean = slice.reduce((s, b) => s + b.close, 0) / length;
    const variance = slice.reduce((s, b) => s + (b.close - mean) ** 2, 0) / length;
    const std = Math.sqrt(variance);
    bands.push({ time: bars[i]!.time, upper: mean + mult * std, middle: mean, lower: mean - mult * std });
  }
  return {
    name: 'BB',
    overlay: true,
    lines: [
      { key: 'upper', color: COLORS.bb, type: 'line' },
      { key: 'middle', color: COLORS.bb, type: 'line' },
      { key: 'lower', color: COLORS.bb, type: 'line' },
    ],
    points: bands.map((b) => ({ time: b.time, value: b.middle })),
    bands,
  };
};

export const keltnerChannels = (bars: ReadonlyArray<Bar>, length: number, mult: number): IndicatorOutput => {
  const atr = (n: number) => {
    const trs: number[] = [];
    for (let i = 1; i < n + 1 && i < bars.length; i++) {
      const cur = bars[i]!;
      const prev = bars[i - 1]!;
      const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
      trs.push(tr);
    }
    return trs.length ? trs.reduce((s, v) => s + v, 0) / trs.length : 0;
  };
  const emaCalc = (n: number) => ema(bars, n).points;
  const midPoints = emaCalc(length);
  const atrVal = atr(length);
  const bands = midPoints.map((p) => ({ time: p.time, upper: p.value + mult * atrVal, middle: p.value, lower: p.value - mult * atrVal }));
  return {
    name: 'KC',
    overlay: true,
    lines: [
      { key: 'upper', color: COLORS.keltner, type: 'line' },
      { key: 'middle', color: COLORS.keltner, type: 'line' },
      { key: 'lower', color: COLORS.keltner, type: 'line' },
    ],
    points: midPoints,
    bands,
  };
};

export const donchianChannels = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const bands: { time: number; upper: number; middle: number; lower: number }[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    bands.push({ time: bars[i]!.time, upper: high, middle: (high + low) / 2, lower: low });
  }
  return {
    name: 'DC',
    overlay: true,
    lines: [
      { key: 'upper', color: COLORS.donchian, type: 'line' },
      { key: 'middle', color: COLORS.donchian, type: 'line' },
      { key: 'lower', color: COLORS.donchian, type: 'line' },
    ],
    points: bands.map((b) => ({ time: b.time, value: b.middle })),
    bands,
  };
};
