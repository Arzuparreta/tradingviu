import type { Bar } from '@tv/data-types';
import type { IndicatorOutput, IndicatorPoint } from './types.js';
import { ema } from './overlap.js';

const COLORS = {
  atr: '#f59e0b',
  bbw: '#94a3b8',
  tr: '#64748b',
  stddev: '#06b6d4',
  histvol: '#a855f7',
  ulcer: '#ef5350',
};

export const trueRange = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    points.push({ time: cur.time, value: tr });
  }
  return { name: 'TR', overlay: false, lines: [{ key: 'tr', color: COLORS.tr, type: 'line' }], points };
};

export const atr = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  const points: IndicatorPoint[] = [];
  if (trs.length < length) return { name: 'ATR', overlay: false, lines: [{ key: 'atr', color: COLORS.atr, type: 'line' }], points };
  let prev = trs.slice(0, length).reduce((s, v) => s + v, 0) / length;
  const startTime = bars[length]!.time;
  points.push({ time: startTime, value: prev });
  for (let i = length; i < trs.length; i++) {
    prev = (prev * (length - 1) + trs[i]!) / length;
    points.push({ time: bars[i + 1]!.time, value: prev });
  }
  return { name: 'ATR', overlay: false, lines: [{ key: 'atr', color: COLORS.atr, type: 'line' }], points };
};

export const bollingerWidth = (bars: ReadonlyArray<Bar>, length: number, mult: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const mean = slice.reduce((s, b) => s + b.close, 0) / length;
    const std = Math.sqrt(slice.reduce((s, b) => s + (b.close - mean) ** 2, 0) / length);
    points.push({ time: bars[i]!.time, value: mean === 0 ? 0 : ((mult * 2 * std) / mean) * 100 });
  }
  return { name: 'BBW', overlay: false, lines: [{ key: 'bbw', color: COLORS.bbw, type: 'line' }], points };
};

export const stddev = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const mean = slice.reduce((s, b) => s + b.close, 0) / length;
    const std = Math.sqrt(slice.reduce((s, b) => s + (b.close - mean) ** 2, 0) / length);
    points.push({ time: bars[i]!.time, value: std });
  }
  return { name: 'StdDev', overlay: false, lines: [{ key: 'stddev', color: COLORS.stddev, type: 'line' }], points };
};

export const historicalVolatility = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length; i < bars.length; i++) {
    const slice = bars.slice(i - length, i + 1);
    const logReturns: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      const r = Math.log(slice[j]!.close / slice[j - 1]!.close);
      logReturns.push(r);
    }
    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / logReturns.length;
    points.push({ time: bars[i]!.time, value: Math.sqrt(variance) * Math.sqrt(365) * 100 });
  }
  return { name: 'HV', overlay: false, lines: [{ key: 'hv', color: COLORS.histvol, type: 'line' }], points };
};

export const ulcerIndex = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    let maxClose = -Infinity;
    let sumSqDrawdown = 0;
    for (const bar of slice) {
      if (bar.close > maxClose) maxClose = bar.close;
      if (maxClose === 0) continue;
      const dd = ((bar.close - maxClose) / maxClose) * 100;
      sumSqDrawdown += dd * dd;
    }
    points.push({ time: bars[i]!.time, value: Math.sqrt(sumSqDrawdown / slice.length) });
  }
  return { name: 'UI', overlay: false, lines: [{ key: 'ui', color: COLORS.ulcer, type: 'line' }], points };
};
