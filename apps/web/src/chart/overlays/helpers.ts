import type { Coordinate } from 'klinecharts';
import { utils } from 'klinecharts';

/** A point that definitely has x/y (coordinates from klinecharts are complete). */
export type XY = Coordinate;

/**
 * Extend the segment p1→p2 to the bounding box edges (both directions when
 * `both`, otherwise only beyond p2). Vertical lines handled explicitly.
 */
export function extendSegment(p1: XY, p2: XY, width: number, both: boolean): [XY, XY] {
  if (p1.x === p2.x) {
    return both
      ? [
          { x: p1.x, y: 0 },
          { x: p1.x, y: Number.MAX_SAFE_INTEGER / 2 },
        ]
      : [p1, { x: p1.x, y: p2.y > p1.y ? Number.MAX_SAFE_INTEGER / 2 : 0 }];
  }
  const slope = (p2.y - p1.y) / (p2.x - p1.x);
  const at = (x: number): XY => ({ x, y: p1.y + (x - p1.x) * slope });
  if (both) return [at(-width), at(width * 2)];
  return p2.x > p1.x ? [p1, at(width * 2)] : [p1, at(-width)];
}

/** Ellipse outline approximated as a polygon (64 segments) from 2 corner points. */
export function ellipsePolygon(p1: XY, p2: XY): XY[] {
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const rx = Math.abs(p2.x - p1.x) / 2;
  const ry = Math.abs(p2.y - p1.y) / 2;
  const pts: XY[] = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

/** Arrow head polygon for the segment p1→p2, sized relative to line width. */
export function arrowHead(p1: XY, p2: XY, size: number): XY[] {
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const len = 4 + size * 3.2;
  const spread = Math.PI / 7;
  return [
    p2,
    { x: p2.x - len * Math.cos(angle - spread), y: p2.y - len * Math.sin(angle - spread) },
    { x: p2.x - len * Math.cos(angle + spread), y: p2.y - len * Math.sin(angle + spread) },
  ];
}

export const midpoint = (p1: XY, p2: XY): XY => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });

/** Format a price with the chart's precision + thousands separator. */
export const fmtPrice = (value: number, precision: number, thousands: string): string =>
  utils.formatThousands(utils.formatPrecision(value, precision), thousands);

export const fmtPercent = (value: number): string => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

/** Read the line color configured on an overlay (falls back to themed default). */
export function overlayLineColor(styles: unknown, fallback: string): string {
  if (styles && typeof styles === 'object') {
    const line = (styles as { line?: { color?: unknown } }).line;
    if (line && typeof line.color === 'string') return line.color;
  }
  return fallback;
}
