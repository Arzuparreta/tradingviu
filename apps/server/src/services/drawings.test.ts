import { describe, expect, it } from 'bun:test';
import type { Drawing } from '@tv/drawing-tools';
import { drawingToColumns, rowToDrawing } from './drawings.js';

const sample = (): Drawing => ({
  engine: 'klinecharts',
  id: 'd1',
  name: 'segment',
  points: [
    { timestamp: 1700000000000, value: 100 },
    { timestamp: 1700003600000, value: 110 },
  ],
  styles: { line: { color: '#ff0000', size: 3, style: 'dashed' } },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 2,
});

describe('drawing row mapping', () => {
  it('round-trips a kline drawing through columns and back', () => {
    const d = sample();
    const cols = drawingToColumns(d);
    expect(cols.id).toBe(d.id);
    expect(cols.kind).toBe('segment');
    const back = rowToDrawing({ id: cols.id, kind: cols.kind, geometry: cols.geometry, style: cols.style });
    expect(back).toEqual(d);
  });

  it('preserves extend data', () => {
    const d: Drawing = { ...sample(), name: 'text', extendData: { text: 'hello' } };
    const cols = drawingToColumns(d);
    const back = rowToDrawing({ id: cols.id, kind: cols.kind, geometry: cols.geometry, style: cols.style });
    expect(back?.extendData).toEqual({ text: 'hello' });
  });

  it('returns null for a row with non-object geometry', () => {
    expect(rowToDrawing({ id: 'd1', kind: 'segment', geometry: null, style: {} })).toBeNull();
    expect(rowToDrawing({ id: 'd1', kind: 'segment', geometry: 'nope', style: {} })).toBeNull();
  });

  it('converts legacy rows best effort', () => {
    const back = rowToDrawing({
      id: 'old',
      kind: 'trend-line',
      geometry: {
        points: [
          { time: 1700000000, price: 100 },
          { time: 1700003600, price: 110 },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
      style: { color: '#fff', width: 1, lineStyle: 'solid' },
    });
    expect(back?.name).toBe('segment');
  });
});
