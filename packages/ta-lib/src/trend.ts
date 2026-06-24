import type { Bar } from '@tv/data-types';
import { ema, sma } from './overlap.js';
import { atr } from './volatility.js';
import type { IndicatorOutput, IndicatorPoint } from './types.js';

const COLORS = {
  adx: '#3b82f6',
  plusDI: '#26a69a',
  minusDI: '#ef5350',
  aroonUp: '#26a69a',
  aroonDown: '#ef5350',
  psar: '#3b82f6',
  supertrend: '#10b981',
  ichimokuTenkan: '#3b82f6',
  ichimokuKijun: '#f97316',
  ichimokuSenkouA: '#10b981',
  ichimokuSenkouB: '#ef5350',
  ichimokuChikou: '#a855f7',
  vwap: '#06b6d4',
};

const wildersSmooth = (values: number[], length: number): number[] => {
  if (values.length < length) return [];
  const result: number[] = [];
  let prev = values.slice(0, length).reduce((s, v) => s + v, 0) / length;
  result.push(prev);
  for (let i = length; i < values.length; i++) {
    prev = (prev * (length - 1) + values[i]!) / length;
    result.push(prev);
  }
  return result;
};

export const adx = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  if (bars.length < length * 2) return { name: 'ADX', overlay: false, lines: [{ key: 'adx', color: COLORS.adx, type: 'line' }], points };

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const smoothedTR = wildersSmooth(tr, length);
  const smoothedPlusDM = wildersSmooth(plusDM, length);
  const smoothedMinusDM = wildersSmooth(minusDM, length);

  const dx: number[] = [];
  for (let i = 0; i < smoothedTR.length; i++) {
    const plusDI = smoothedTR[i] === 0 ? 0 : (smoothedPlusDM[i]! / smoothedTR[i]!) * 100;
    const minusDI = smoothedTR[i] === 0 ? 0 : (smoothedMinusDM[i]! / smoothedTR[i]!) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
  }

  const smoothedDX = wildersSmooth(dx, length);
  for (let i = 0; i < smoothedDX.length; i++) {
    points.push({ time: bars[bars.length - smoothedDX.length + i]!.time, value: smoothedDX[i]! });
  }
  return { name: 'ADX', overlay: false, lines: [{ key: 'adx', color: COLORS.adx, type: 'line' }], points };
};

export const aroon = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const upPoints: IndicatorPoint[] = [];
  const downPoints: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    let upIdx = 0;
    let downIdx = 0;
    for (let j = 0; j < slice.length; j++) {
      if (slice[j]!.high > slice[upIdx]!.high) upIdx = j;
      if (slice[j]!.low < slice[downIdx]!.low) downIdx = j;
    }
    const barsSinceHigh = slice.length - 1 - upIdx;
    const barsSinceLow = slice.length - 1 - downIdx;
    upPoints.push({ time: bars[i]!.time, value: ((length - barsSinceHigh) / length) * 100 });
    downPoints.push({ time: bars[i]!.time, value: ((length - barsSinceLow) / length) * 100 });
  }
  return {
    name: 'Aroon',
    overlay: false,
    lines: [
      { key: 'up', color: COLORS.aroonUp, type: 'line' },
      { key: 'down', color: COLORS.aroonDown, type: 'line' },
    ],
    points: upPoints,
  };
};

export const psar = (bars: ReadonlyArray<Bar>, step: number, max: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  if (bars.length < 2) return { name: 'PSAR', overlay: true, lines: [{ key: 'psar', color: COLORS.psar, type: 'line' }], points };
  let isLong = true;
  let af = step;
  let ep = bars[0]!.high;
  let sar = bars[0]!.low;
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    sar = sar + af * (ep - sar);
    if (isLong) {
      if (bar.low < sar) {
        isLong = false;
        sar = ep;
        ep = bar.low;
        af = step;
      } else {
        if (bar.high > ep) {
          ep = bar.high;
          af = Math.min(af + step, max);
        }
      }
    } else {
      if (bar.high > sar) {
        isLong = true;
        sar = ep;
        ep = bar.high;
        af = step;
      } else {
        if (bar.low < ep) {
          ep = bar.low;
          af = Math.min(af + step, max);
        }
      }
    }
    points.push({ time: bar.time, value: sar });
  }
  return { name: 'PSAR', overlay: true, lines: [{ key: 'psar', color: COLORS.psar, type: 'line' }], points };
};

export const supertrend = (bars: ReadonlyArray<Bar>, length: number, mult: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  const atrValues = atr(bars, length).points;
  if (atrValues.length < 2) return { name: 'Supertrend', overlay: true, lines: [{ key: 'st', color: COLORS.supertrend, type: 'line' }], points };
  const startIdx = bars.length - atrValues.length;
  let prevSt = 0;
  let prevClose = bars[startIdx]!.close;
  for (let i = 0; i < atrValues.length; i++) {
    const bar = bars[startIdx + i]!;
    const hl2 = (bar.high + bar.low) / 2;
    const upper = hl2 + mult * atrValues[i]!.value;
    const lower = hl2 - mult * atrValues[i]!.value;
    let st = 0;
    if (i === 0) {
      st = bar.close > hl2 ? lower : upper;
    } else {
      st = bar.close > prevSt ? Math.max(lower, prevSt) : Math.min(upper, prevSt);
    }
    prevSt = st;
    prevClose = bar.close;
    points.push({ time: bar.time, value: st });
  }
  return { name: 'Supertrend', overlay: true, lines: [{ key: 'st', color: COLORS.supertrend, type: 'line' }], points };
};

export const ichimoku = (
  bars: ReadonlyArray<Bar>,
  tenkan: number,
  kijun: number,
  senkou: number,
): IndicatorOutput => {
  const mid = (slice: Bar[]) => {
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    return (high + low) / 2;
  };
  const tenkanPts: IndicatorPoint[] = [];
  const kijunPts: IndicatorPoint[] = [];
  for (let i = Math.max(tenkan, kijun) - 1; i < bars.length - senkou; i++) {
    const t = mid(bars.slice(i - tenkan + 1, i + 1));
    const k = mid(bars.slice(i - kijun + 1, i + 1));
    tenkanPts.push({ time: bars[i]!.time, value: t });
    kijunPts.push({ time: bars[i]!.time, value: k });
  }
  return {
    name: 'Ichimoku',
    overlay: true,
    lines: [
      { key: 'tenkan', color: COLORS.ichimokuTenkan, type: 'line' },
      { key: 'kijun', color: COLORS.ichimokuKijun, type: 'line' },
    ],
    points: tenkanPts,
  };
};
