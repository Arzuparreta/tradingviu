import type { OverlayTemplate } from 'klinecharts';
import { token } from '../theme';
import { arrowHead, overlayLineColor } from './helpers';

/** Crosshair-style marker: full-width horizontal + full-height vertical line at one point. */
export const crossLine: OverlayTemplate = {
  name: 'crossLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length === 0) return [];
    const p = coordinates[0]!;
    return [
      { type: 'line', attrs: { coordinates: [{ x: 0, y: p.y }, { x: bounding.width, y: p.y }] } },
      { type: 'line', attrs: { coordinates: [{ x: p.x, y: 0 }, { x: p.x, y: bounding.height }] } },
    ];
  },
};

/** Trend line with an arrow head at the second point. */
export const arrowLine: OverlayTemplate = {
  name: 'arrow',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const size = ((overlay.styles?.line as { size?: number } | undefined)?.size ?? 1) as number;
    const color = overlayLineColor(overlay.styles, token('--accent'));
    return [
      { type: 'line', attrs: { coordinates: [p1, p2] } },
      {
        type: 'polygon',
        attrs: { coordinates: arrowHead(p1, p2, size) },
        styles: { style: 'fill', color },
        ignoreEvent: true,
      },
    ];
  },
};
