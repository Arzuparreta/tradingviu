import type { ChartPatternDefinition, ChartPatternMatch, Pivot, ScanContext } from './types.js';
import {
  barPoint,
  breakoutAbove,
  breakoutBelow,
  equality,
  pivotPoint,
  round2,
  withinTol,
} from './helpers.js';

/** Read pivot at position `k` with the expected kind, else undefined. */
const at = (pivots: ReadonlyArray<Pivot>, k: number, kind: Pivot['kind']): Pivot | undefined => {
  const p = pivots[k];
  return p && p.kind === kind ? p : undefined;
};

// ── Double Top ──────────────────────────────────────────────────────────────
// high · low · high, the two highs near-equal, confirmed by a close below the
// intervening trough (the neckline). Bearish reversal.
const doubleTop: ChartPatternDefinition = {
  id: 'double-top',
  name: 'Double Top',
  direction: 'bearish',
  category: 'reversal',
  description: 'Two peaks at a similar level; a close below the trough confirms a top.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 2 < pivots.length; k++) {
      const t1 = at(pivots, k, 'high');
      const tr = at(pivots, k + 1, 'low');
      const t2 = at(pivots, k + 2, 'high');
      if (!t1 || !tr || !t2) continue;
      if (!withinTol(t1.price, t2.price, priceTol)) continue;
      const top = (t1.price + t2.price) / 2;
      if ((top - tr.price) / top < minHeight) continue;
      const j = breakoutBelow(bars, t2.index, () => tr.price, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bearish',
        category: 'reversal',
        startIndex: t1.index,
        endIndex: j,
        startTime: t1.time,
        endTime: b.time,
        points: [
          pivotPoint(t1, 'top-1'),
          pivotPoint(tr, 'neckline'),
          pivotPoint(t2, 'top-2'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(tr.price),
        target: round2(tr.price - (top - tr.price)),
        confidence: round2(equality(t1.price, t2.price, priceTol)),
      });
    }
    return out;
  },
};

// ── Double Bottom ───────────────────────────────────────────────────────────
const doubleBottom: ChartPatternDefinition = {
  id: 'double-bottom',
  name: 'Double Bottom',
  direction: 'bullish',
  category: 'reversal',
  description: 'Two troughs at a similar level; a close above the peak confirms a bottom.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 2 < pivots.length; k++) {
      const b1 = at(pivots, k, 'low');
      const pk = at(pivots, k + 1, 'high');
      const b2 = at(pivots, k + 2, 'low');
      if (!b1 || !pk || !b2) continue;
      if (!withinTol(b1.price, b2.price, priceTol)) continue;
      const bottom = (b1.price + b2.price) / 2;
      if ((pk.price - bottom) / pk.price < minHeight) continue;
      const j = breakoutAbove(bars, b2.index, () => pk.price, confirmWithin);
      if (j < 0) continue;
      const bar = bars[j];
      if (!bar) continue;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bullish',
        category: 'reversal',
        startIndex: b1.index,
        endIndex: j,
        startTime: b1.time,
        endTime: bar.time,
        points: [
          pivotPoint(b1, 'bottom-1'),
          pivotPoint(pk, 'neckline'),
          pivotPoint(b2, 'bottom-2'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(pk.price),
        target: round2(pk.price + (pk.price - bottom)),
        confidence: round2(equality(b1.price, b2.price, priceTol)),
      });
    }
    return out;
  },
};

// ── Triple Top ──────────────────────────────────────────────────────────────
// high · low · high · low · high, the three highs near-equal, confirmed by a
// close below the lower of the two troughs. Bearish reversal.
const tripleTop: ChartPatternDefinition = {
  id: 'triple-top',
  name: 'Triple Top',
  direction: 'bearish',
  category: 'reversal',
  description: 'Three peaks at a similar level; a close below support confirms a top.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 4 < pivots.length; k++) {
      const h1 = at(pivots, k, 'high');
      const l1 = at(pivots, k + 1, 'low');
      const h2 = at(pivots, k + 2, 'high');
      const l2 = at(pivots, k + 3, 'low');
      const h3 = at(pivots, k + 4, 'high');
      if (!h1 || !l1 || !h2 || !l2 || !h3) continue;
      if (!withinTol(h1.price, h2.price, priceTol) || !withinTol(h2.price, h3.price, priceTol))
        continue;
      const top = (h1.price + h2.price + h3.price) / 3;
      const neckline = Math.min(l1.price, l2.price);
      if ((top - neckline) / top < minHeight) continue;
      const j = breakoutBelow(bars, h3.index, () => neckline, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bearish',
        category: 'reversal',
        startIndex: h1.index,
        endIndex: j,
        startTime: h1.time,
        endTime: b.time,
        points: [
          pivotPoint(h1, 'top-1'),
          pivotPoint(l1, 'trough-1'),
          pivotPoint(h2, 'top-2'),
          pivotPoint(l2, 'trough-2'),
          pivotPoint(h3, 'top-3'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(neckline),
        target: round2(neckline - (top - neckline)),
        confidence: round2(
          (equality(h1.price, h2.price, priceTol) + equality(h2.price, h3.price, priceTol)) / 2,
        ),
      });
    }
    return out;
  },
};

// ── Triple Bottom ───────────────────────────────────────────────────────────
const tripleBottom: ChartPatternDefinition = {
  id: 'triple-bottom',
  name: 'Triple Bottom',
  direction: 'bullish',
  category: 'reversal',
  description: 'Three troughs at a similar level; a close above resistance confirms a bottom.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 4 < pivots.length; k++) {
      const b1 = at(pivots, k, 'low');
      const p1 = at(pivots, k + 1, 'high');
      const b2 = at(pivots, k + 2, 'low');
      const p2 = at(pivots, k + 3, 'high');
      const b3 = at(pivots, k + 4, 'low');
      if (!b1 || !p1 || !b2 || !p2 || !b3) continue;
      if (!withinTol(b1.price, b2.price, priceTol) || !withinTol(b2.price, b3.price, priceTol))
        continue;
      const bottom = (b1.price + b2.price + b3.price) / 3;
      const neckline = Math.max(p1.price, p2.price);
      if ((neckline - bottom) / neckline < minHeight) continue;
      const j = breakoutAbove(bars, b3.index, () => neckline, confirmWithin);
      if (j < 0) continue;
      const bar = bars[j];
      if (!bar) continue;
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bullish',
        category: 'reversal',
        startIndex: b1.index,
        endIndex: j,
        startTime: b1.time,
        endTime: bar.time,
        points: [
          pivotPoint(b1, 'bottom-1'),
          pivotPoint(p1, 'peak-1'),
          pivotPoint(b2, 'bottom-2'),
          pivotPoint(p2, 'peak-2'),
          pivotPoint(b3, 'bottom-3'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(neckline),
        target: round2(neckline + (neckline - bottom)),
        confidence: round2(
          (equality(b1.price, b2.price, priceTol) + equality(b2.price, b3.price, priceTol)) / 2,
        ),
      });
    }
    return out;
  },
};

// ── Head & Shoulders ────────────────────────────────────────────────────────
// high(LS) · low(T1) · high(Head) · low(T2) · high(RS). Head is the highest
// peak; the shoulders are near-equal and lower; the troughs form the neckline.
// Confirmed by a close below the (possibly sloped) neckline. Bearish reversal.
const headAndShoulders: ChartPatternDefinition = {
  id: 'head-and-shoulders',
  name: 'Head and Shoulders',
  direction: 'bearish',
  category: 'reversal',
  description: 'A peak (head) flanked by two lower peaks (shoulders); a neckline break confirms.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const shoulderTol = priceTol * 1.8;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 4 < pivots.length; k++) {
      const ls = at(pivots, k, 'high');
      const t1 = at(pivots, k + 1, 'low');
      const head = at(pivots, k + 2, 'high');
      const t2 = at(pivots, k + 3, 'low');
      const rs = at(pivots, k + 4, 'high');
      if (!ls || !t1 || !head || !t2 || !rs) continue;
      if (head.price <= ls.price || head.price <= rs.price) continue;
      if (!withinTol(ls.price, rs.price, shoulderTol)) continue;
      const shoulder = Math.max(ls.price, rs.price);
      if ((head.price - shoulder) / head.price < minHeight) continue;
      const slope = (t2.price - t1.price) / (t2.index - t1.index);
      const neckAt = (x: number): number => t1.price + slope * (x - t1.index);
      const j = breakoutBelow(bars, rs.index, neckAt, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const neckline = neckAt(j);
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bearish',
        category: 'reversal',
        startIndex: ls.index,
        endIndex: j,
        startTime: ls.time,
        endTime: b.time,
        points: [
          pivotPoint(ls, 'left-shoulder'),
          pivotPoint(t1, 'neckline-1'),
          pivotPoint(head, 'head'),
          pivotPoint(t2, 'neckline-2'),
          pivotPoint(rs, 'right-shoulder'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(neckline),
        target: round2(neckline - (head.price - neckline)),
        confidence: round2(equality(ls.price, rs.price, shoulderTol)),
      });
    }
    return out;
  },
};

// ── Inverse Head & Shoulders ────────────────────────────────────────────────
const inverseHeadAndShoulders: ChartPatternDefinition = {
  id: 'inverse-head-and-shoulders',
  name: 'Inverse Head and Shoulders',
  direction: 'bullish',
  category: 'reversal',
  description: 'A trough (head) flanked by two higher troughs; a neckline break confirms.',
  scan(ctx: ScanContext): ChartPatternMatch[] {
    const { pivots, bars, priceTol, minHeight, confirmWithin } = ctx;
    const shoulderTol = priceTol * 1.8;
    const out: ChartPatternMatch[] = [];
    for (let k = 0; k + 4 < pivots.length; k++) {
      const ls = at(pivots, k, 'low');
      const p1 = at(pivots, k + 1, 'high');
      const head = at(pivots, k + 2, 'low');
      const p2 = at(pivots, k + 3, 'high');
      const rs = at(pivots, k + 4, 'low');
      if (!ls || !p1 || !head || !p2 || !rs) continue;
      if (head.price >= ls.price || head.price >= rs.price) continue;
      if (!withinTol(ls.price, rs.price, shoulderTol)) continue;
      const shoulder = Math.min(ls.price, rs.price);
      if ((shoulder - head.price) / shoulder < minHeight) continue;
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      const neckAt = (x: number): number => p1.price + slope * (x - p1.index);
      const j = breakoutAbove(bars, rs.index, neckAt, confirmWithin);
      if (j < 0) continue;
      const b = bars[j];
      if (!b) continue;
      const neckline = neckAt(j);
      out.push({
        id: this.id,
        name: this.name,
        direction: 'bullish',
        category: 'reversal',
        startIndex: ls.index,
        endIndex: j,
        startTime: ls.time,
        endTime: b.time,
        points: [
          pivotPoint(ls, 'left-shoulder'),
          pivotPoint(p1, 'neckline-1'),
          pivotPoint(head, 'head'),
          pivotPoint(p2, 'neckline-2'),
          pivotPoint(rs, 'right-shoulder'),
          barPoint(bars, j, 'breakout'),
        ],
        breakoutLevel: round2(neckline),
        target: round2(neckline + (neckline - head.price)),
        confidence: round2(equality(ls.price, rs.price, shoulderTol)),
      });
    }
    return out;
  },
};

export const reversalPatterns: readonly ChartPatternDefinition[] = [
  doubleTop,
  doubleBottom,
  tripleTop,
  tripleBottom,
  headAndShoulders,
  inverseHeadAndShoulders,
];
