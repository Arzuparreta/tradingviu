import type { OverlayTemplate } from 'klinecharts';
import { ellipsePolygon } from './helpers';

/**
 * Shape tools. Fill + border colors come from the overlay's polygon style
 * bucket, so the style editor drives them like any other drawing.
 */

export const rect: OverlayTemplate = {
  name: 'rect',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    return [
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p1.y },
            { x: p2.x, y: p2.y },
            { x: p1.x, y: p2.y },
          ],
        },
        styles: { style: 'stroke_fill' },
      },
    ];
  },
};

export const ellipse: OverlayTemplate = {
  name: 'ellipse',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    return [
      {
        type: 'polygon',
        attrs: { coordinates: ellipsePolygon(coordinates[0]!, coordinates[1]!) },
        styles: { style: 'stroke_fill' },
      },
    ];
  },
};

export const triangle: OverlayTemplate = {
  name: 'triangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    if (coordinates.length === 2) {
      return [{ type: 'line', attrs: { coordinates: [coordinates[0]!, coordinates[1]!] } }];
    }
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [coordinates[0]!, coordinates[1]!, coordinates[2]!] },
        styles: { style: 'stroke_fill' },
      },
    ];
  },
};
