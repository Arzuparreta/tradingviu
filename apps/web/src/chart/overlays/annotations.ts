import type { OverlayTemplate } from 'klinecharts';
import { alpha, token } from '../theme';
import { fmtPrice, overlayLineColor } from './helpers';

/**
 * Annotation tools. Text content lives in extendData.text — the panel opens an
 * inline editor on draw end / double click and writes it back.
 */

const textOf = (extendData: unknown): string => {
  if (extendData && typeof extendData === 'object') {
    const t = (extendData as { text?: unknown }).text;
    if (typeof t === 'string' && t.length > 0) return t;
  }
  return 'Text';
};

export const text: OverlayTemplate = {
  name: 'text',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length === 0) return [];
    const p = coordinates[0]!;
    return [
      {
        type: 'text',
        attrs: { x: p.x, y: p.y, text: textOf(overlay.extendData), align: 'center', baseline: 'bottom' },
        styles: { size: 13 },
      },
    ];
  },
};

/** Callout: anchor point + leader line to a floating text box. */
export const callout: OverlayTemplate = {
  name: 'callout',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length === 0) return [];
    const anchor = coordinates[0]!;
    if (coordinates.length === 1) return [];
    const box = coordinates[1]!;
    const color = overlayLineColor(overlay.styles, token('--accent'));
    return [
      { type: 'line', attrs: { coordinates: [anchor, box] }, styles: { size: 1 } },
      { type: 'circle', attrs: { x: anchor.x, y: anchor.y, r: 2.5 }, styles: { style: 'fill', color } },
      {
        type: 'text',
        attrs: { x: box.x, y: box.y, text: textOf(overlay.extendData), align: 'center', baseline: 'middle' },
        styles: {
          size: 12,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 5,
          paddingBottom: 5,
          borderRadius: 4,
          borderSize: 1,
          borderColor: color,
          color: token('--text-bright'),
          backgroundColor: token('--surface-3'),
        },
      },
    ];
  },
};

/** Price label: pill showing the point's price, with a stem down to the anchor. */
export const priceLabel: OverlayTemplate = {
  name: 'priceLabel',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, precision, thousandsSeparator }) => {
    if (coordinates.length === 0) return [];
    const p = coordinates[0]!;
    const value = overlay.points[0]?.value;
    if (value === undefined) return [];
    const color = overlayLineColor(overlay.styles, token('--accent'));
    return [
      { type: 'line', attrs: { coordinates: [{ x: p.x, y: p.y - 22 }, p] }, styles: { size: 1 } },
      { type: 'circle', attrs: { x: p.x, y: p.y, r: 2 }, styles: { style: 'fill', color } },
      {
        type: 'text',
        attrs: { x: p.x, y: p.y - 22, text: fmtPrice(value, precision.price, thousandsSeparator), align: 'center', baseline: 'bottom' },
        styles: {
          size: 11,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 3,
          borderSize: 1,
          borderColor: color,
          color: token('--text-bright'),
          backgroundColor: alpha('#1e232c', 0.92),
        },
      },
    ];
  },
};
