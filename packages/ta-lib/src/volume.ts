import type { Bar } from '@tv/data-types';
import type { IndicatorOutput, IndicatorPoint } from './types.js';
import { ema } from './overlap.js';

const COLORS = {
  obv: '#3b82f6',
  cmf: '#10b981',
  ad: '#a855f7',
  vwap: '#06b6d4',
  pvt: '#f59e0b',
  nvi: '#ef5350',
};

export const obv = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let cum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      cum = bars[i]!.volume;
    } else {
      if (bars[i]!.close > bars[i - 1]!.close) cum += bars[i]!.volume;
      else if (bars[i]!.close < bars[i - 1]!.close) cum -= bars[i]!.volume;
    }
    points.push({ time: bars[i]!.time, value: cum });
  }
  return { name: 'OBV', overlay: false, lines: [{ key: 'obv', color: COLORS.obv, type: 'line' }], points };
};

export const cmf = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    let mfvVol = 0;
    let totalVol = 0;
    for (const bar of slice) {
      const range = bar.high - bar.low;
      const mfm = range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
      mfvVol += mfm * bar.volume;
      totalVol += bar.volume;
    }
    points.push({ time: bars[i]!.time, value: totalVol === 0 ? 0 : mfvVol / totalVol });
  }
  return { name: 'CMF', overlay: false, lines: [{ key: 'cmf', color: COLORS.cmf, type: 'line' }], points };
};

export const ad = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let cum = 0;
  for (const bar of bars) {
    const range = bar.high - bar.low;
    const mfm = range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    cum += mfm * bar.volume;
    points.push({ time: bar.time, value: cum });
  }
  return { name: 'AD', overlay: false, lines: [{ key: 'ad', color: COLORS.ad, type: 'line' }], points };
};

export const pvt = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let cum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      cum = 0;
    } else {
      const change = (bars[i]!.close - bars[i - 1]!.close) / bars[i - 1]!.close;
      cum += change * bars[i]!.volume;
    }
    points.push({ time: bars[i]!.time, value: cum });
  }
  return { name: 'PVT', overlay: false, lines: [{ key: 'pvt', color: COLORS.pvt, type: 'line' }], points };
};

export const nvi = (bars: ReadonlyArray<Bar>): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  let cum = 1000;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      points.push({ time: bars[i]!.time, value: cum });
      continue;
    }
    if (bars[i]!.volume < bars[i - 1]!.volume) {
      const change = (bars[i]!.close - bars[i - 1]!.close) / bars[i - 1]!.close;
      cum += change * cum;
    }
    points.push({ time: bars[i]!.time, value: cum });
  }
  return { name: 'NVI', overlay: false, lines: [{ key: 'nvi', color: COLORS.nvi, type: 'line' }], points };
};
