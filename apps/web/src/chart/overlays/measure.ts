import type { OverlayFigure, OverlayTemplate } from 'klinecharts';
import { alpha, token } from '../theme';
import { fmtPercent, fmtPrice, midpoint } from './helpers';

/**
 * Measure + position tools. Colors are semantic (up/down tokens), not user
 * styleable — a risk zone is red because it is risk, not decoration.
 */

const labelStyles = (borderColor: string) => ({
  size: 11,
  paddingLeft: 7,
  paddingRight: 7,
  paddingTop: 4,
  paddingBottom: 4,
  borderRadius: 3,
  borderSize: 1,
  borderColor,
  color: token('--text-bright'),
  backgroundColor: alpha('#1e232c', 0.94),
});

/** Price range: vertical measurement between two prices with % + absolute. */
export const priceRange: OverlayTemplate = {
  name: 'priceRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates, precision, thousandsSeparator }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const [a, b] = [overlay.points[0], overlay.points[1]];
    if (a?.value === undefined || b?.value === undefined) return [];
    const rising = b.value >= a.value;
    const color = rising ? token('--up') : token('--down');
    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const cx = (left + right) / 2;
    const diff = b.value - a.value;
    const pct = a.value === 0 ? 0 : diff / a.value;
    const label = `${diff >= 0 ? '+' : ''}${fmtPrice(diff, precision.price, thousandsSeparator)}  (${fmtPercent(pct)})`;
    return [
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: left, y: p1.y },
            { x: right, y: p1.y },
            { x: right, y: p2.y },
            { x: left, y: p2.y },
          ],
        },
        styles: { style: 'fill', color: alpha(color, 0.08) },
      },
      { type: 'line', attrs: { coordinates: [{ x: left, y: p1.y }, { x: right, y: p1.y }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: left, y: p2.y }, { x: right, y: p2.y }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: cx, y: p1.y }, { x: cx, y: p2.y }] }, styles: { color, size: 1, style: 'dashed' } },
      {
        type: 'text',
        attrs: { x: cx, y: rising ? Math.min(p1.y, p2.y) - 6 : Math.max(p1.y, p2.y) + 6, text: label, align: 'center', baseline: rising ? 'bottom' : 'top' },
        styles: labelStyles(color),
        ignoreEvent: true,
      },
    ];
  },
};

/** Date range: horizontal measurement showing bars + elapsed time. */
export const dateRange: OverlayTemplate = {
  name: 'dateRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 2) return [];
    const [p1, p2] = [coordinates[0]!, coordinates[1]!];
    const [a, b] = [overlay.points[0], overlay.points[1]];
    const color = token('--accent');
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const cy = (top + bottom) / 2;
    let label = '';
    if (a?.dataIndex !== undefined && b?.dataIndex !== undefined) {
      label = `${Math.abs(b.dataIndex - a.dataIndex)} bars`;
    }
    if (a?.timestamp !== undefined && b?.timestamp !== undefined) {
      const ms = Math.abs(b.timestamp - a.timestamp);
      const days = Math.floor(ms / 86_400_000);
      const hours = Math.floor((ms % 86_400_000) / 3_600_000);
      const mins = Math.floor((ms % 3_600_000) / 60_000);
      const dur = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      label = label ? `${label}, ${dur}` : dur;
    }
    return [
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: p1.x, y: top },
            { x: p2.x, y: top },
            { x: p2.x, y: bottom },
            { x: p1.x, y: bottom },
          ],
        },
        styles: { style: 'fill', color: alpha(color, 0.07) },
      },
      { type: 'line', attrs: { coordinates: [{ x: p1.x, y: top }, { x: p1.x, y: bottom }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: p2.x, y: top }, { x: p2.x, y: bottom }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: p1.x, y: cy }, { x: p2.x, y: cy }] }, styles: { color, size: 1, style: 'dashed' } },
      {
        type: 'text',
        attrs: { x: (p1.x + p2.x) / 2, y: bottom + 6, text: label, align: 'center', baseline: 'top' },
        styles: labelStyles(color),
        ignoreEvent: true,
      },
    ];
  },
};

/**
 * Position tools: entry (p1) → target (p2) → stop (p3). Renders profit and
 * risk zones over the x-span plus an R/R label. `direction` decides which
 * zone is which color.
 */
function positionTemplate(name: string, direction: 'long' | 'short'): OverlayTemplate {
  return {
    name,
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ overlay, coordinates, precision, thousandsSeparator, bounding }) => {
      if (coordinates.length < 2) return [];
      const [p1, p2] = [coordinates[0]!, coordinates[1]!];
      const entry = overlay.points[0]?.value;
      const target = overlay.points[1]?.value;
      if (entry === undefined || target === undefined) return [];
      const left = Math.min(p1.x, p2.x);
      const right = Math.max(p1.x, p2.x, left + Math.min(bounding.width * 0.12, 140));
      const up = token('--up');
      const down = token('--down');

      const zone = (y1: number, y2: number, color: string): OverlayFigure => ({
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: left, y: y1 },
            { x: right, y: y1 },
            { x: right, y: y2 },
            { x: left, y: y2 },
          ],
        },
        styles: { style: 'fill', color: alpha(color, 0.1) },
      });
      const edge = (y: number, color: string): OverlayFigure => ({
        type: 'line',
        attrs: { coordinates: [{ x: left, y }, { x: right, y }] },
        styles: { color, size: 1 },
      });

      const figures: OverlayFigure[] = [
        zone(p1.y, p2.y, up),
        edge(p2.y, up),
        edge(p1.y, token('--text-muted')),
        {
          type: 'text',
          attrs: { x: right + 4, y: p2.y, text: `target ${fmtPrice(target, precision.price, thousandsSeparator)}`, align: 'left', baseline: 'middle' },
          styles: { color: up, size: 10, backgroundColor: 'transparent' },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: { x: right + 4, y: p1.y, text: `entry ${fmtPrice(entry, precision.price, thousandsSeparator)}`, align: 'left', baseline: 'middle' },
          styles: { color: token('--text-muted'), size: 10, backgroundColor: 'transparent' },
          ignoreEvent: true,
        },
      ];

      const stop = overlay.points[2]?.value;
      if (stop !== undefined && coordinates.length > 2) {
        const p3 = coordinates[2]!;
        figures.push(
          zone(p1.y, p3.y, down),
          edge(p3.y, down),
          {
            type: 'text',
            attrs: { x: right + 4, y: p3.y, text: `stop ${fmtPrice(stop, precision.price, thousandsSeparator)}`, align: 'left', baseline: 'middle' },
            styles: { color: down, size: 10, backgroundColor: 'transparent' },
            ignoreEvent: true,
          },
        );
        const reward = Math.abs(target - entry);
        const risk = Math.abs(entry - stop);
        const rr = risk === 0 ? null : reward / risk;
        const pct = entry === 0 ? 0 : (direction === 'long' ? target - entry : entry - target) / entry;
        figures.push({
          type: 'text',
          attrs: {
            x: (left + right) / 2,
            y: midpoint(p1, p2).y,
            text: `${direction === 'long' ? 'Long' : 'Short'}  ${fmtPercent(pct)}${rr === null ? '' : `  R/R ${rr.toFixed(2)}`}`,
            align: 'center',
            baseline: 'middle',
          },
          styles: labelStyles(direction === 'long' ? up : down),
          ignoreEvent: true,
        });
      }
      return figures;
    },
  };
}

export const longPosition = positionTemplate('longPosition', 'long');
export const shortPosition = positionTemplate('shortPosition', 'short');
