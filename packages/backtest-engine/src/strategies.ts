import type { Bar } from '@tv/data-types';
import type { StrategyConfig, StrategyDef, StrategyType } from './types.js';

/** Simple moving average; entries are null until `length` samples exist. */
export const sma = (values: readonly number[], length: number): (number | null)[] => {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (length < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= length) sum -= values[i - length]!;
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
};

/** Wilder's RSI; null until `length` deltas exist. */
export const rsi = (closes: readonly number[], length: number): (number | null)[] => {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < length + 1 || length < 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= length;
  avgLoss /= length;
  const rsiAt = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[length] = rsiAt(avgGain, avgLoss);
  for (let i = length + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    out[i] = rsiAt(avgGain, avgLoss);
  }
  return out;
};

const num = (params: Record<string, number>, key: string, fallback: number): number => {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

/**
 * A strategy's desired position at each bar, in `{-1, 0, 1}`, computed causally
 * (using only data up to and including that bar). The simulator executes a
 * position change on the *next* bar's open, so there is no look-ahead.
 */
export const generateSignals = (bars: ReadonlyArray<Bar>, strategy: StrategyConfig): number[] => {
  const closes = bars.map((b) => b.close);
  const p = strategy.params;
  switch (strategy.type) {
    case 'maCross': {
      const fast = sma(closes, Math.max(1, Math.round(num(p, 'fast', 10))));
      const slow = sma(closes, Math.max(1, Math.round(num(p, 'slow', 30))));
      const sig: number[] = new Array(bars.length).fill(0);
      let pos = 0;
      for (let i = 0; i < bars.length; i++) {
        const f = fast[i];
        const s = slow[i];
        if (f != null && s != null) pos = f > s ? 1 : f < s ? -1 : pos;
        sig[i] = pos;
      }
      return sig;
    }
    case 'rsiReversal': {
      const period = Math.max(1, Math.round(num(p, 'period', 14)));
      const lower = num(p, 'lower', 30);
      const upper = num(p, 'upper', 70);
      const r = rsi(closes, period);
      const sig: number[] = new Array(bars.length).fill(0);
      let pos = 0;
      for (let i = 0; i < bars.length; i++) {
        const v = r[i];
        if (v != null) pos = v < lower ? 1 : v > upper ? -1 : pos;
        sig[i] = pos;
      }
      return sig;
    }
    case 'donchianBreakout': {
      const period = Math.max(1, Math.round(num(p, 'period', 20)));
      const sig: number[] = new Array(bars.length).fill(0);
      let pos = 0;
      for (let i = 0; i < bars.length; i++) {
        if (i >= period) {
          let hi = -Infinity;
          let lo = Infinity;
          for (let j = i - period; j < i; j++) {
            if (bars[j]!.high > hi) hi = bars[j]!.high;
            if (bars[j]!.low < lo) lo = bars[j]!.low;
          }
          const c = bars[i]!.close;
          pos = c > hi ? 1 : c < lo ? -1 : pos;
        }
        sig[i] = pos;
      }
      return sig;
    }
  }
};

/** Strategies with their tunable parameters, for the API + UI catalog. */
export const strategyCatalog: readonly StrategyDef[] = [
  {
    type: 'maCross',
    label: 'Moving Average Cross',
    description: 'Long when the fast SMA is above the slow SMA, short/flat when below.',
    params: [
      { key: 'fast', label: 'Fast length', default: 10, min: 1, max: 200, step: 1 },
      { key: 'slow', label: 'Slow length', default: 30, min: 2, max: 400, step: 1 },
    ],
  },
  {
    type: 'rsiReversal',
    label: 'RSI Reversal',
    description: 'Long when RSI drops below the lower band, short/flat when it rises above the upper band.',
    params: [
      { key: 'period', label: 'RSI length', default: 14, min: 2, max: 100, step: 1 },
      { key: 'lower', label: 'Oversold', default: 30, min: 1, max: 50, step: 1 },
      { key: 'upper', label: 'Overbought', default: 70, min: 50, max: 99, step: 1 },
    ],
  },
  {
    type: 'donchianBreakout',
    label: 'Donchian Breakout',
    description: 'Long on a close above the prior N-bar high, short/flat on a close below the prior N-bar low.',
    params: [{ key: 'period', label: 'Channel length', default: 20, min: 2, max: 200, step: 1 }],
  },
];

export const findStrategy = (type: StrategyType): StrategyDef | undefined =>
  strategyCatalog.find((s) => s.type === type);

/**
 * Map an arbitrary numeric series (e.g. a Pine plot) to backtest signals by
 * sign: positive → long (1), negative → short (-1), zero / null → flat (0).
 */
export const signalsFromSeries = (data: ReadonlyArray<number | null>): number[] =>
  data.map((v) => (v == null || !Number.isFinite(v) ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0));
