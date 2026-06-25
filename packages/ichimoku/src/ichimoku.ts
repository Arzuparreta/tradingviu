import type { Bar } from '@tv/data-types';
import type {
  Ichimoku,
  IchimokuCloudPoint,
  IchimokuLinePoint,
  IchimokuOptions,
} from './types.js';

/** Midpoint of the highest high and lowest low over `bars[from..to]`. */
const midHighLow = (bars: ReadonlyArray<Bar>, from: number, to: number): number => {
  let high = -Infinity;
  let low = Infinity;
  for (let i = from; i <= to; i++) {
    const b = bars[i]!;
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }
  return (high + low) / 2;
};

/**
 * Smallest positive gap between consecutive bar times — the bar interval used
 * to synthesize future timestamps for the forward-displaced leading spans.
 * Falls back to 60s when it can't be inferred.
 */
const inferStep = (bars: ReadonlyArray<Bar>): number => {
  let step = Infinity;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i]!.time - bars[i - 1]!.time;
    if (d > 0 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : 60;
};

const emptyIchimoku = (params: Ichimoku['params']): Ichimoku => ({
  tenkan: [],
  kijun: [],
  senkouA: [],
  senkouB: [],
  chikou: [],
  cloud: [],
  params,
});

/**
 * Compute Ichimoku Kinkō Hyō over `bars`. Leading spans (Senkou A/B) are
 * plotted `displacement` bars into the future — beyond the last bar those times
 * are synthesized from the inferred bar step. The lagging span (Chikou) is the
 * close plotted `displacement` bars into the past. Pure and deterministic.
 */
export const computeIchimoku = (
  bars: ReadonlyArray<Bar>,
  opts: IchimokuOptions = {},
): Ichimoku => {
  const tenkanLen = Math.max(1, Math.floor(opts.tenkan ?? 9));
  const kijunLen = Math.max(1, Math.floor(opts.kijun ?? 26));
  const senkouLen = Math.max(1, Math.floor(opts.senkou ?? 52));
  const displacement = Math.max(0, Math.floor(opts.displacement ?? kijunLen));
  const params = { tenkan: tenkanLen, kijun: kijunLen, senkou: senkouLen, displacement };

  const len = bars.length;
  if (len === 0) return emptyIchimoku(params);

  const step = inferStep(bars);
  const lastTime = bars[len - 1]!.time;
  /** Time of the bar `displacement` ahead of index `i`, synthesized past the end. */
  const futureTime = (i: number): number => {
    const j = i + displacement;
    return j < len ? bars[j]!.time : lastTime + (j - (len - 1)) * step;
  };

  const tenkanRaw = new Array<number | null>(len).fill(null);
  const kijunRaw = new Array<number | null>(len).fill(null);
  const senkouBRaw = new Array<number | null>(len).fill(null);

  const tenkan: IchimokuLinePoint[] = [];
  const kijun: IchimokuLinePoint[] = [];
  for (let i = 0; i < len; i++) {
    if (i >= tenkanLen - 1) {
      const v = midHighLow(bars, i - tenkanLen + 1, i);
      tenkanRaw[i] = v;
      tenkan.push({ time: bars[i]!.time, value: v });
    }
    if (i >= kijunLen - 1) {
      const v = midHighLow(bars, i - kijunLen + 1, i);
      kijunRaw[i] = v;
      kijun.push({ time: bars[i]!.time, value: v });
    }
    if (i >= senkouLen - 1) {
      senkouBRaw[i] = midHighLow(bars, i - senkouLen + 1, i);
    }
  }

  // Leading spans, displaced forward.
  const senkouA: IchimokuLinePoint[] = [];
  const senkouB: IchimokuLinePoint[] = [];
  const cloud: IchimokuCloudPoint[] = [];
  for (let i = 0; i < len; i++) {
    const t = tenkanRaw[i];
    const k = kijunRaw[i];
    const b = senkouBRaw[i];
    const time = futureTime(i);
    if (t != null && k != null) {
      const a = (t + k) / 2;
      senkouA.push({ time, value: a });
      if (b != null) {
        senkouB.push({ time, value: b });
        cloud.push({ time, spanA: a, spanB: b, bullish: a >= b });
      }
    } else if (b != null) {
      senkouB.push({ time, value: b });
    }
  }

  // Lagging span: today's close plotted `displacement` bars back.
  const chikou: IchimokuLinePoint[] = [];
  for (let i = 0; i + displacement < len; i++) {
    chikou.push({ time: bars[i]!.time, value: bars[i + displacement]!.close });
  }

  return { tenkan, kijun, senkouA, senkouB, chikou, cloud, params };
};
