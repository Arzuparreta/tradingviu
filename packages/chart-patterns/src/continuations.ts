import type {
  ChartPatternDefinition,
  ChartPatternMatch,
  ChartPatternPoint,
  Pivot,
  ScanContext,
} from './types.js';
import {
  barPoint,
  breakoutAbove,
  breakoutBelow,
  clamp01,
  pivotPoint,
  round2,
  slope,
  trendOf,
} from './helpers.js';

/** A 4-pivot window carrying its two highs and two lows in chronological order. */
interface TriWindow {
  readonly hA: Pivot;
  readonly hB: Pivot;
  readonly lA: Pivot;
  readonly lB: Pivot;
  readonly lastIndex: number;
}

/** Every consecutive 4-pivot window that contains exactly two highs and two lows. */
const triWindows = (pivots: ReadonlyArray<Pivot>): TriWindow[] => {
  const out: TriWindow[] = [];
  for (let k = 0; k + 3 < pivots.length; k++) {
    const w = [pivots[k], pivots[k + 1], pivots[k + 2], pivots[k + 3]];
    if (w.some((p) => !p)) continue;
    const win = w as Pivot[];
    const highs = win.filter((p) => p.kind === 'high');
    const lows = win.filter((p) => p.kind === 'low');
    const hA = highs[0];
    const hB = highs[1];
    const lA = lows[0];
    const lB = lows[1];
    const last = win[3];
    if (!hA || !hB || !lA || !lB || !last) continue;
    out.push({ hA, hB, lA, lB, lastIndex: last.index });
  }
  return out;
};

/** Pattern height across the four pivots, as a fraction of price. */
const windowHeight = (w: TriWindow): number => {
  const hi = Math.max(w.hA.price, w.hB.price);
  const lo = Math.min(w.lA.price, w.lB.price);
  return hi <= 0 ? 0 : (hi - lo) / hi;
};

/** Convergence quality in [0, 1] from how much the two trendline slopes differ. */
const convergence = (w: TriWindow): number => {
  const sh = Math.abs(slope(w.hA, w.hB));
  const sl = Math.abs(slope(w.lA, w.lB));
  return clamp01(Math.abs(sh - sl) / (sh + sl + 1e-9));
};

const shapePoints = (w: TriWindow, bars: ScanContext['bars'], j: number): ChartPatternPoint[] => {
  // Order the four pivots chronologically, then append the breakout bar.
  const pts = [
    pivotPoint(w.hA, 'resistance-1'),
    pivotPoint(w.lA, 'support-1'),
    pivotPoint(w.hB, 'resistance-2'),
    pivotPoint(w.lB, 'support-2'),
  ].sort((a, b) => a.index - b.index);
  return [...pts, barPoint(bars, j, 'breakout')];
};

// ── Ascending Triangle ──────────────────────────────────────────────────────
// Flat highs (resistance), rising lows. A close above resistance is bullish.
const ascendingTriangle: ChartPatternDefinition = {
  id: 'ascending-triangle',
  name: 'Ascending Triangle',
  direction: 'bullish',
  category: 'continuation',
  description: 'Flat resistance with rising support; a breakout above resistance is bullish.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { bars, pivots, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (const w of triWindows(pivots)) {
      if (trendOf(w.hA, w.hB, priceTol) !== 'flat') continue;
      if (trendOf(w.lA, w.lB, priceTol) !== 'up') continue;
      if (windowHeight(w) < minHeight) continue;
      const resistance = (w.hA.price + w.hB.price) / 2;
      const j = breakoutAbove(bars, w.lastIndex, () => resistance, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const height = resistance - w.lA.price;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bullish',
        category: 'continuation',
        startIndex: Math.min(w.hA.index, w.lA.index),
        endIndex: j,
        startTime: Math.min(w.hA.time, w.lA.time),
        endTime: b.time,
        points: shapePoints(w, bars, j),
        breakoutLevel: round2(resistance),
        target: round2(resistance + height),
        confidence: round2(0.6 + 0.4 * clamp01(slope(w.lA, w.lB) > 0 ? 1 : 0)),
      });
    }
    return out;
  },
};

// ── Descending Triangle ─────────────────────────────────────────────────────
const descendingTriangle: ChartPatternDefinition = {
  id: 'descending-triangle',
  name: 'Descending Triangle',
  direction: 'bearish',
  category: 'continuation',
  description: 'Flat support with falling resistance; a breakout below support is bearish.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { bars, pivots, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (const w of triWindows(pivots)) {
      if (trendOf(w.lA, w.lB, priceTol) !== 'flat') continue;
      if (trendOf(w.hA, w.hB, priceTol) !== 'down') continue;
      if (windowHeight(w) < minHeight) continue;
      const support = (w.lA.price + w.lB.price) / 2;
      const j = breakoutBelow(bars, w.lastIndex, () => support, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const height = w.hA.price - support;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bearish',
        category: 'continuation',
        startIndex: Math.min(w.hA.index, w.lA.index),
        endIndex: j,
        startTime: Math.min(w.hA.time, w.lA.time),
        endTime: b.time,
        points: shapePoints(w, bars, j),
        breakoutLevel: round2(support),
        target: round2(support - height),
        confidence: round2(0.6 + 0.4 * clamp01(slope(w.hA, w.hB) < 0 ? 1 : 0)),
      });
    }
    return out;
  },
};

// ── Symmetrical Triangle ────────────────────────────────────────────────────
// Falling highs and rising lows converging. Direction follows the breakout.
const symmetricalTriangle: ChartPatternDefinition = {
  id: 'symmetrical-triangle',
  name: 'Symmetrical Triangle',
  direction: 'neutral',
  category: 'continuation',
  description: 'Falling highs and rising lows converge; the breakout sets the direction.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { bars, pivots, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (const w of triWindows(pivots)) {
      if (trendOf(w.hA, w.hB, priceTol) !== 'down') continue;
      if (trendOf(w.lA, w.lB, priceTol) !== 'up') continue;
      if (windowHeight(w) < minHeight) continue;
      // Break beyond the most recent contact rather than the projected apex
      // (a converging line shot forward diverges quickly from reality).
      const upLevel = w.hB.price;
      const downLevel = w.lB.price;
      const up = breakoutAbove(bars, w.lastIndex, () => upLevel, confirmWithin);
      const down = breakoutBelow(bars, w.lastIndex, () => downLevel, confirmWithin);
      if (up < 0 && down < 0) continue;
      const upFirst = up >= 0 && (down < 0 || up <= down);
      const j = upFirst ? up : down;
      const b = bars[j];
      if (!b) continue;
      const height = Math.max(w.hA.price, w.hB.price) - Math.min(w.lA.price, w.lB.price);
      const level = upFirst ? upLevel : downLevel;
      out.push({
        id: this.id,
        name: this.name,
        direction: upFirst ? 'bullish' : 'bearish',
        category: 'continuation',
        startIndex: Math.min(w.hA.index, w.lA.index),
        endIndex: j,
        startTime: Math.min(w.hA.time, w.lA.time),
        endTime: b.time,
        points: shapePoints(w, bars, j),
        breakoutLevel: round2(level),
        target: round2(upFirst ? level + height : level - height),
        confidence: round2(0.6 + 0.4 * convergence(w)),
      });
    }
    return out;
  },
};

// ── Rising Wedge ────────────────────────────────────────────────────────────
// Both lines rising but converging (lows rise faster). Bearish on a break below.
const risingWedge: ChartPatternDefinition = {
  id: 'rising-wedge',
  name: 'Rising Wedge',
  direction: 'bearish',
  category: 'continuation',
  description: 'Rising, converging trendlines; a break below the support line is bearish.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { bars, pivots, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (const w of triWindows(pivots)) {
      if (trendOf(w.hA, w.hB, priceTol) !== 'up') continue;
      if (trendOf(w.lA, w.lB, priceTol) !== 'up') continue;
      if (slope(w.lA, w.lB) <= slope(w.hA, w.hB)) continue; // must converge
      if (windowHeight(w) < minHeight) continue;
      const support = w.lB.price;
      const j = breakoutBelow(bars, w.lastIndex, () => support, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const level = support;
      const height = Math.max(w.hA.price, w.hB.price) - Math.min(w.lA.price, w.lB.price);
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bearish',
        category: 'continuation',
        startIndex: Math.min(w.hA.index, w.lA.index),
        endIndex: j,
        startTime: Math.min(w.hA.time, w.lA.time),
        endTime: b.time,
        points: shapePoints(w, bars, j),
        breakoutLevel: round2(level),
        target: round2(level - height),
        confidence: round2(0.6 + 0.4 * convergence(w)),
      });
    }
    return out;
  },
};

// ── Falling Wedge ───────────────────────────────────────────────────────────
const fallingWedge: ChartPatternDefinition = {
  id: 'falling-wedge',
  name: 'Falling Wedge',
  direction: 'bullish',
  category: 'continuation',
  description: 'Falling, converging trendlines; a break above the resistance line is bullish.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { bars, pivots, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (const w of triWindows(pivots)) {
      if (trendOf(w.hA, w.hB, priceTol) !== 'down') continue;
      if (trendOf(w.lA, w.lB, priceTol) !== 'down') continue;
      if (slope(w.hA, w.hB) >= slope(w.lA, w.lB)) continue; // highs must fall faster
      if (windowHeight(w) < minHeight) continue;
      const resistance = w.hB.price;
      const j = breakoutAbove(bars, w.lastIndex, () => resistance, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const level = resistance;
      const height = Math.max(w.hA.price, w.hB.price) - Math.min(w.lA.price, w.lB.price);
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bullish',
        category: 'continuation',
        startIndex: Math.min(w.hA.index, w.lA.index),
        endIndex: j,
        startTime: Math.min(w.hA.time, w.lA.time),
        endTime: b.time,
        points: shapePoints(w, bars, j),
        breakoutLevel: round2(level),
        target: round2(level + height),
        confidence: round2(0.6 + 0.4 * convergence(w)),
      });
    }
    return out;
  },
};

export const continuationPatterns: readonly ChartPatternDefinition[] = [
  ascendingTriangle,
  descendingTriangle,
  symmetricalTriangle,
  risingWedge,
  fallingWedge,
];
