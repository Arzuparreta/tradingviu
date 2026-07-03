import type { OverlayFigure, OverlayTemplate } from 'klinecharts';
import { alpha, token } from '../theme';
import { overlayLineColor, type XY } from './helpers';

/**
 * Channel tools. All are segment-bounded (TradingView default) — the fill and
 * parallels span exactly the drawn x-range, no infinite extension noise.
 */

const FILL_ALPHA = 0.08;

const shiftLine = (p1: XY, p2: XY, dy: number): [XY, XY] => [
  { x: p1.x, y: p1.y + dy },
  { x: p2.x, y: p2.y + dy },
];

/**
 * Parallel channel: p1→p2 base line, p3 sets the offset. Renders base,
 * parallel, dashed midline, and a translucent fill.
 */
export const parallelChannel: OverlayTemplate = {
  name: 'parallelChannel',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const figures: OverlayFigure[] = [
      { type: 'line', attrs: { coordinates: [p1, p2] } },
    ];
    if (coordinates.length > 2) {
      const p3 = coordinates[2]!;
      // Vertical offset of p3 from the base line at p3.x.
      const slope = p2.x === p1.x ? 0 : (p2.y - p1.y) / (p2.x - p1.x);
      const dy = p3.y - (p1.y + (p3.x - p1.x) * slope);
      const [q1, q2] = shiftLine(p1, p2, dy);
      const [m1, m2] = shiftLine(p1, p2, dy / 2);
      const color = overlayLineColor(overlay.styles, token('--accent'));
      figures.push(
        {
          type: 'polygon',
          attrs: { coordinates: [p1, p2, q2, q1] },
          styles: { style: 'fill', color: alpha(color, FILL_ALPHA) },
        },
        { type: 'line', attrs: { coordinates: [q1, q2] } },
        { type: 'line', attrs: { coordinates: [m1, m2] }, styles: { style: 'dashed', size: 1 } },
      );
    }
    return figures;
  },
};

/**
 * Flat top/bottom: sloped base p1→p2 plus a flat level from p3, joined by a fill.
 */
export const flatTopBottom: OverlayTemplate = {
  name: 'flatTopBottom',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const figures: OverlayFigure[] = [
      { type: 'line', attrs: { coordinates: [p1, p2] } },
    ];
    if (coordinates.length > 2) {
      const p3 = coordinates[2]!;
      const f1 = { x: p1.x, y: p3.y };
      const f2 = { x: p2.x, y: p3.y };
      const color = overlayLineColor(overlay.styles, token('--accent'));
      figures.push(
        {
          type: 'polygon',
          attrs: { coordinates: [p1, p2, f2, f1] },
          styles: { style: 'fill', color: alpha(color, FILL_ALPHA) },
        },
        { type: 'line', attrs: { coordinates: [f1, f2] } },
      );
    }
    return figures;
  },
};

/**
 * Regression trend: base line p1→p2 with ±k·σ rails. The deviation (in price
 * units) is computed by the chart panel from the bars in range and stored in
 * extendData — the template stays pure geometry.
 */
export const regressionTrend: OverlayTemplate = {
  name: 'regressionTrend',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, yAxis }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const ext = overlay.extendData as { baseValues?: [number, number]; deviation?: number } | undefined;
    const color = overlayLineColor(overlay.styles, token('--accent'));

    // Deviation is stored in price units; convert to pixels via the y axis.
    let dyPx = 0;
    if (ext?.deviation && yAxis) {
      const y0 = yAxis.convertToPixel(0);
      const y1 = yAxis.convertToPixel(ext.deviation);
      dyPx = Math.abs(y1 - y0);
    }
    const base: [XY, XY] = [p1, p2];
    if (dyPx === 0) {
      return [{ type: 'line', attrs: { coordinates: base } }];
    }
    const upper = shiftLine(p1, p2, -dyPx);
    const lower = shiftLine(p1, p2, dyPx);
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [upper[0], upper[1], lower[1], lower[0]] },
        styles: { style: 'fill', color: alpha(color, FILL_ALPHA) },
      },
      { type: 'line', attrs: { coordinates: base }, styles: { style: 'dashed' } },
      { type: 'line', attrs: { coordinates: upper } },
      { type: 'line', attrs: { coordinates: lower } },
    ];
  },
};

/**
 * Andrews pitchfork: median from p1 through the p2–p3 midpoint, tines through
 * p2 and p3 parallel to the median, all extended right to the pane edge.
 */
export const pitchfork: OverlayTemplate = {
  name: 'andrewsPitchfork',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    if (coordinates.length === 2) {
      return [{ type: 'line', attrs: { coordinates: [p1, p2] }, styles: { style: 'dashed' } }];
    }
    const p3 = coordinates[2]!;
    const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
    const right = bounding.width;
    const extendTo = (from: XY, slope: number): XY => ({ x: right, y: from.y + (right - from.x) * slope });
    if (mid.x === p1.x) {
      return [
        { type: 'line', attrs: { coordinates: [p2, p3] }, styles: { style: 'dashed' } },
        { type: 'line', attrs: { coordinates: [p1, mid] } },
      ];
    }
    const slope = (mid.y - p1.y) / (mid.x - p1.x);
    const color = overlayLineColor(overlay.styles, token('--accent'));
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [p2, extendTo(p2, slope), extendTo(p3, slope), p3] },
        styles: { style: 'fill', color: alpha(color, 0.05) },
      },
      { type: 'line', attrs: { coordinates: [p2, p3] }, styles: { style: 'dashed' } },
      { type: 'line', attrs: { coordinates: [p1, mid, extendTo(mid, slope)] } },
      { type: 'line', attrs: { coordinates: [p2, extendTo(p2, slope)] } },
      { type: 'line', attrs: { coordinates: [p3, extendTo(p3, slope)] } },
    ];
  },
};
