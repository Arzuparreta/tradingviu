import type { Bar } from '@tv/data-types';
import { ema, sma } from './overlap.js';
import type { IndicatorOutput, IndicatorPoint } from './types.js';

const COLORS = {
  rsi: '#a855f7',
  macd: '#3b82f6',
  macdSignal: '#f97316',
  macdHist: '#64748b',
  stochK: '#3b82f6',
  stochD: '#f97316',
  cci: '#10b981',
  roc: '#06b6d4',
  williams: '#a855f7',
  mfi: '#f59e0b',
  ao: '#10b981',
  uo: '#06b6d4',
};

export const rsi = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  if (bars.length < length + 1) return { name: 'RSI', overlay: false, lines: [{ key: 'rsi', color: COLORS.rsi, type: 'line' }], points };
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const change = bars[i]!.close - bars[i - 1]!.close;
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= length;
  avgLoss /= length;
  points.push({ time: bars[length]!.time, value: 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss)) });
  for (let i = length + 1; i < bars.length; i++) {
    const change = bars[i]!.close - bars[i - 1]!.close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    points.push({ time: bars[i]!.time, value: 100 - 100 / (1 + rs) });
  }
  return { name: 'RSI', overlay: false, lines: [{ key: 'rsi', color: COLORS.rsi, type: 'line' }], points };
};

export const macd = (bars: ReadonlyArray<Bar>, fast: number, slow: number, signal: number): IndicatorOutput => {
  const fastEma = ema(bars, fast).points;
  const slowEma = ema(bars, slow).points;
  const macdLine: IndicatorPoint[] = [];
  const len = Math.min(fastEma.length, slowEma.length);
  for (let i = 0; i < len; i++) {
    macdLine.push({ time: slowEma[i]!.time, value: fastEma[i]!.value - slowEma[i]!.value });
  }
  const signalLine = ema(
    macdLine.map((p) => ({ time: p.time, open: 0, high: 0, low: 0, close: p.value, volume: 0 })),
    signal,
  ).points;
  const hist: IndicatorPoint[] = [];
  const offset = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    hist.push({ time: signalLine[i]!.time, value: macdLine[offset + i]!.value - signalLine[i]!.value });
  }
  return {
    name: 'MACD',
    overlay: false,
    lines: [
      { key: 'macd', color: COLORS.macd, type: 'line' },
      { key: 'signal', color: COLORS.macdSignal, type: 'line' },
    ],
    points: signalLine,
    histogram: hist,
  };
};

export const stochastic = (bars: ReadonlyArray<Bar>, k: number, d: number, smooth: number): IndicatorOutput => {
  const kValues: IndicatorPoint[] = [];
  for (let i = k - 1; i < bars.length; i++) {
    const slice = bars.slice(i - k + 1, i + 1);
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    const close = bars[i]!.close;
    const kVal = high === low ? 50 : ((close - low) / (high - low)) * 100;
    kValues.push({ time: bars[i]!.time, value: kVal });
  }
  const kSmoothed = sma(
    kValues.map((p) => ({ time: p.time, open: 0, high: 0, low: 0, close: p.value, volume: 0 })),
    smooth,
  ).points;
  const dValues = sma(
    kSmoothed.map((p) => ({ time: p.time, open: 0, high: 0, low: 0, close: p.value, volume: 0 })),
    d,
  ).points;
  return {
    name: 'Stoch',
    overlay: false,
    lines: [
      { key: 'k', color: COLORS.stochK, type: 'line' },
      { key: 'd', color: COLORS.stochD, type: 'line' },
    ],
    points: dValues,
  };
};

export const cci = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const tps = slice.map((b) => (b.high + b.low + b.close) / 3);
    const mean = tps.reduce((s, v) => s + v, 0) / length;
    const meanDev = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / length;
    const tp = tps[tps.length - 1]!;
    const cci = meanDev === 0 ? 0 : (tp - mean) / (0.015 * meanDev);
    points.push({ time: bars[i]!.time, value: cci });
  }
  return { name: 'CCI', overlay: false, lines: [{ key: 'cci', color: COLORS.cci, type: 'line' }], points };
};

export const roc = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length; i < bars.length; i++) {
    const prev = bars[i - length]!.close;
    const cur = bars[i]!.close;
    points.push({ time: bars[i]!.time, value: prev === 0 ? 0 : ((cur - prev) / prev) * 100 });
  }
  return { name: 'ROC', overlay: false, lines: [{ key: 'roc', color: COLORS.roc, type: 'line' }], points };
};

export const williamsR = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = length - 1; i < bars.length; i++) {
    const slice = bars.slice(i - length + 1, i + 1);
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    const close = bars[i]!.close;
    const r = high === low ? -50 : ((high - close) / (high - low)) * -100;
    points.push({ time: bars[i]!.time, value: r });
  }
  return { name: 'Williams %R', overlay: false, lines: [{ key: 'wr', color: COLORS.williams, type: 'line' }], points };
};

export const mfi = (bars: ReadonlyArray<Bar>, length: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  if (bars.length < length + 1) return { name: 'MFI', overlay: false, lines: [{ key: 'mfi', color: COLORS.mfi, type: 'line' }], points };
  for (let i = length; i < bars.length; i++) {
    const slice = bars.slice(i - length, i + 1);
    let posFlow = 0;
    let negFlow = 0;
    for (let j = 1; j < slice.length; j++) {
      const cur = slice[j]!;
      const prev = slice[j - 1]!;
      const tp = (cur.high + cur.low + cur.close) / 3;
      const prevTp = (prev.high + prev.low + prev.close) / 3;
      const flow = tp * cur.volume;
      if (tp > prevTp) posFlow += flow;
      else negFlow += flow;
    }
    const ratio = negFlow === 0 ? Infinity : posFlow / negFlow;
    points.push({ time: bars[i]!.time, value: 100 - 100 / (1 + ratio) });
  }
  return { name: 'MFI', overlay: false, lines: [{ key: 'mfi', color: COLORS.mfi, type: 'line' }], points };
};

export const ao = (bars: ReadonlyArray<Bar>, fast: number, slow: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  for (let i = slow - 1; i < bars.length; i++) {
    const fastSlice = bars.slice(i - fast + 1, i + 1);
    const slowSlice = bars.slice(i - slow + 1, i + 1);
    const fastMid = fastSlice.reduce((s, b) => s + (b.high + b.low) / 2, 0) / fast;
    const slowMid = slowSlice.reduce((s, b) => s + (b.high + b.low) / 2, 0) / slow;
    points.push({ time: bars[i]!.time, value: fastMid - slowMid });
  }
  return { name: 'AO', overlay: false, lines: [{ key: 'ao', color: COLORS.ao, type: 'line' }], points };
};

export const ultimateOscillator = (bars: ReadonlyArray<Bar>, p1: number, p2: number, p3: number): IndicatorOutput => {
  const points: IndicatorPoint[] = [];
  if (bars.length < Math.max(p1, p2, p3) * 4) return { name: 'UO', overlay: false, lines: [{ key: 'uo', color: COLORS.uo, type: 'line' }], points };
  for (let i = Math.max(p1, p2, p3) * 4; i < bars.length; i++) {
    let bp1 = 0, tr1 = 0, bp2 = 0, tr2 = 0, bp3 = 0, tr3 = 0;
    for (let j = 0; j < p1; j++) {
      const cur = bars[i - j]!;
      const prev = bars[i - j - 1]!;
      const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
      const bp = cur.close - Math.min(cur.low, prev.close);
      bp1 += bp; tr1 += tr;
    }
    for (let j = 0; j < p2; j++) {
      const cur = bars[i - j]!;
      const prev = bars[i - j - 1]!;
      const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
      const bp = cur.close - Math.min(cur.low, prev.close);
      bp2 += bp; tr2 += tr;
    }
    for (let j = 0; j < p3; j++) {
      const cur = bars[i - j]!;
      const prev = bars[i - j - 1]!;
      const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
      const bp = cur.close - Math.min(cur.low, prev.close);
      bp3 += bp; tr3 += tr;
    }
    const avg1 = tr1 === 0 ? 0 : bp1 / tr1;
    const avg2 = tr2 === 0 ? 0 : bp2 / tr2;
    const avg3 = tr3 === 0 ? 0 : bp3 / tr3;
    const uo = 100 * ((4 * avg1 + 2 * avg2 + avg3) / (4 + 2 + 1));
    points.push({ time: bars[i]!.time, value: uo });
  }
  return { name: 'UO', overlay: false, lines: [{ key: 'uo', color: COLORS.uo, type: 'line' }], points };
};
