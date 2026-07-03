import type { OverlayFigure, OverlayTemplate } from 'klinecharts';
import { alpha } from '../theme';
import { fmtPrice } from './helpers';

/**
 * Fibonacci tools with labeled levels and translucent band fills — the
 * built-in fibonacciLine (bare gray lines, no fills) stays registered for
 * legacy drawings, but the toolbar creates these.
 */

interface FibLevel {
  value: number;
  color: string;
}

// Level palette follows TradingView conventions so muscle memory transfers.
const RETRACEMENT_LEVELS: FibLevel[] = [
  { value: 0, color: '#848b97' },
  { value: 0.236, color: '#f0616d' },
  { value: 0.382, color: '#e8b64c' },
  { value: 0.5, color: '#4cc9b8' },
  { value: 0.618, color: '#2dbd96' },
  { value: 0.786, color: '#5aa7f0' },
  { value: 1, color: '#848b97' },
];

const EXTENSION_LEVELS: FibLevel[] = [
  { value: 0, color: '#848b97' },
  { value: 0.618, color: '#f0616d' },
  { value: 1, color: '#e8b64c' },
  { value: 1.618, color: '#2dbd96' },
  { value: 2.618, color: '#5aa7f0' },
  { value: 3.618, color: '#c77ff0' },
];

function fibFigures(
  levels: FibLevel[],
  x1: number,
  x2: number,
  priceAt: (level: number) => number,
  yAt: (price: number) => number,
  precision: number,
  thousands: string,
): OverlayFigure[] {
  const figures: OverlayFigure[] = [];
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    const price = priceAt(level.value);
    const y = yAt(price);
    if (i > 0) {
      const prevY = yAt(priceAt(levels[i - 1]!.value));
      figures.push({
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: left, y: prevY },
            { x: right, y: prevY },
            { x: right, y },
            { x: left, y },
          ],
        },
        styles: { style: 'fill', color: alpha(level.color, 0.06) },
        ignoreEvent: true,
      });
    }
    figures.push(
      {
        type: 'line',
        attrs: { coordinates: [{ x: left, y }, { x: right, y }] },
        styles: { color: level.color, size: 1 },
      },
      {
        type: 'text',
        attrs: { x: left - 6, y, text: `${level.value} (${fmtPrice(price, precision, thousands)})`, align: 'right', baseline: 'middle' },
        styles: { color: level.color, size: 10, backgroundColor: 'transparent' },
        ignoreEvent: true,
      },
    );
  }
  return figures;
}

/** Fib retracement: 2 points span the move; levels between them. */
export const fibRetracement: OverlayTemplate = {
  name: 'fibRetracement',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, precision, thousandsSeparator, yAxis }) => {
    if (coordinates.length < 2 || !yAxis) return [];
    const [start, end] = [overlay.points[0], overlay.points[1]];
    if (start?.value === undefined || end?.value === undefined) return [];
    const v1 = start.value;
    const v2 = end.value;
    return fibFigures(
      RETRACEMENT_LEVELS,
      coordinates[0]!.x,
      coordinates[1]!.x,
      (lvl) => v2 - (v2 - v1) * lvl,
      (price) => yAxis.convertToPixel(price),
      precision.price,
      thousandsSeparator,
    );
  },
};

/** Trend-based fib extension: 3 points (A→B move, C anchor), levels projected from C. */
export const fibExtension: OverlayTemplate = {
  name: 'fibExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, precision, thousandsSeparator, yAxis }) => {
    if (coordinates.length < 2) return [];
    const figures: OverlayFigure[] = [
      {
        type: 'line',
        attrs: { coordinates: [coordinates[0]!, coordinates[1]!] },
        styles: { style: 'dashed' },
      },
    ];
    if (coordinates.length < 3 || !yAxis) return figures;
    figures.push({
      type: 'line',
      attrs: { coordinates: [coordinates[1]!, coordinates[2]!] },
      styles: { style: 'dashed' },
    });
    const [a, b, c] = [overlay.points[0], overlay.points[1], overlay.points[2]];
    if (a?.value === undefined || b?.value === undefined || c?.value === undefined) return figures;
    const move = b.value - a.value;
    return figures.concat(
      fibFigures(
        EXTENSION_LEVELS,
        coordinates[2]!.x,
        coordinates[2]!.x + Math.abs(coordinates[1]!.x - coordinates[0]!.x),
        (lvl) => c.value! + move * lvl,
        (price) => yAxis.convertToPixel(price),
        precision.price,
        thousandsSeparator,
      ),
    );
  },
};
