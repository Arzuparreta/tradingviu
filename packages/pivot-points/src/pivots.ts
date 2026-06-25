import type { Bar } from '@tv/data-types';
import type {
  PivotLevel,
  PivotMethod,
  PivotPeriod,
  PivotPoints,
  PivotPointsOptions,
  PivotSet,
} from './types.js';

const DAY_MS = 86_400_000;

/** Deterministic calendar-period key for a bar time (UTC seconds). */
const periodKey = (timeSec: number, period: PivotPeriod): number => {
  const d = new Date(timeSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (period === 'M') return y * 12 + m;
  const midnight = Date.UTC(y, m, day);
  if (period === 'D') return midnight;
  // Week: anchor to the preceding Monday (UTC).
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  return midnight - dow * DAY_MS;
};

interface PeriodOHLC {
  startTime: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Collapse time-ordered bars into consecutive calendar-period OHLC groups. */
const groupByPeriod = (bars: ReadonlyArray<Bar>, period: PivotPeriod): PeriodOHLC[] => {
  const groups: PeriodOHLC[] = [];
  let key: number | null = null;
  for (const bar of bars) {
    const k = periodKey(bar.time, period);
    if (k !== key) {
      groups.push({
        startTime: bar.time,
        endTime: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
      key = k;
    } else {
      const g = groups[groups.length - 1]!;
      g.endTime = bar.time;
      if (bar.high > g.high) g.high = bar.high;
      if (bar.low < g.low) g.low = bar.low;
      g.close = bar.close;
    }
  }
  return groups;
};

/**
 * Pivot levels from a prior period's `h/l/c/o`. `currentOpen` is the current
 * period's open, used only by Woodie. Returns levels low → high where it is
 * meaningful, but order is not significant to callers.
 */
const computeLevels = (
  method: PivotMethod,
  h: number,
  l: number,
  c: number,
  o: number,
  currentOpen: number,
): PivotLevel[] => {
  const lvl = (name: string, value: number): PivotLevel => ({ name, value });
  const range = h - l;
  switch (method) {
    case 'standard': {
      const pp = (h + l + c) / 3;
      return [
        lvl('S3', l - 2 * (h - pp)),
        lvl('S2', pp - range),
        lvl('S1', 2 * pp - h),
        lvl('PP', pp),
        lvl('R1', 2 * pp - l),
        lvl('R2', pp + range),
        lvl('R3', h + 2 * (pp - l)),
      ];
    }
    case 'fibonacci': {
      const pp = (h + l + c) / 3;
      return [
        lvl('S3', pp - range),
        lvl('S2', pp - 0.618 * range),
        lvl('S1', pp - 0.382 * range),
        lvl('PP', pp),
        lvl('R1', pp + 0.382 * range),
        lvl('R2', pp + 0.618 * range),
        lvl('R3', pp + range),
      ];
    }
    case 'camarilla': {
      const pp = (h + l + c) / 3;
      const k = (range * 1.1) / 12;
      return [
        lvl('S4', c - k * 6),
        lvl('S3', c - k * 3),
        lvl('S2', c - k * 2),
        lvl('S1', c - k),
        lvl('PP', pp),
        lvl('R1', c + k),
        lvl('R2', c + k * 2),
        lvl('R3', c + k * 3),
        lvl('R4', c + k * 6),
      ];
    }
    case 'woodie': {
      const pp = (h + l + 2 * currentOpen) / 4;
      return [
        lvl('S2', pp - range),
        lvl('S1', 2 * pp - h),
        lvl('PP', pp),
        lvl('R1', 2 * pp - l),
        lvl('R2', pp + range),
      ];
    }
    case 'demark': {
      const x = c < o ? h + 2 * l + c : c > o ? 2 * h + l + c : h + l + 2 * c;
      return [lvl('S1', x / 2 - h), lvl('PP', x / 4), lvl('R1', x / 2 - l)];
    }
  }
};

/**
 * Compute pivot points over `bars`. Bars are grouped into calendar `period`
 * (D/W/M) buckets; each current period's levels are derived from the *prior*
 * period's range using `method`. Pure and deterministic.
 */
export const computePivotPoints = (
  bars: ReadonlyArray<Bar>,
  opts: PivotPointsOptions = {},
): PivotPoints => {
  const method = opts.method ?? 'standard';
  const period = opts.period ?? 'D';

  const groups = groupByPeriod(bars, period);
  const sets: PivotSet[] = [];
  for (let i = 1; i < groups.length; i++) {
    const prior = groups[i - 1]!;
    const cur = groups[i]!;
    sets.push({
      startTime: cur.startTime,
      endTime: cur.endTime,
      basisHigh: prior.high,
      basisLow: prior.low,
      basisClose: prior.close,
      basisOpen: prior.open,
      levels: computeLevels(method, prior.high, prior.low, prior.close, prior.open, cur.open),
    });
  }

  return {
    method,
    period,
    periodCount: groups.length,
    sets,
    latest: sets.length > 0 ? sets[sets.length - 1]! : null,
  };
};
