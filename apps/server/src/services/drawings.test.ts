import { describe, expect, it } from 'bun:test';
import { makeDrawing, type Drawing } from '@tv/drawing-tools';
import { drawingToColumns, rowToDrawing } from './drawings.js';

const sample = (): Drawing =>
  makeDrawing(
    'trend-line',
    [
      { time: 1700000000, price: 100 },
      { time: 1700003600, price: 110 },
    ],
    { color: '#ff0000', width: 3, lineStyle: 'dashed' },
  );

describe('drawing row mapping', () => {
  it('round-trips a drawing through columns and back', () => {
    const d = sample();
    const cols = drawingToColumns(d);
    expect(cols.id).toBe(d.id);
    expect(cols.kind).toBe('trend-line');
    const back = rowToDrawing({ id: cols.id, kind: cols.kind, geometry: cols.geometry, style: cols.style });
    expect(back).toEqual(d);
  });

  it('preserves optional text on text drawings', () => {
    const d = makeDrawing('text', [{ time: 1700000000, price: 50 }], { color: '#fff', width: 1, lineStyle: 'solid' }, 'hello');
    const cols = drawingToColumns(d);
    const back = rowToDrawing({ id: cols.id, kind: cols.kind, geometry: cols.geometry, style: cols.style });
    expect(back?.text).toBe('hello');
  });

  it('omits text when the drawing has none', () => {
    const cols = drawingToColumns(sample());
    expect('text' in cols.geometry).toBe(false);
  });

  it('returns null for a row with non-object geometry', () => {
    expect(rowToDrawing({ id: 'd1', kind: 'trend-line', geometry: null, style: {} })).toBeNull();
    expect(rowToDrawing({ id: 'd1', kind: 'trend-line', geometry: 'nope', style: {} })).toBeNull();
  });

  it('returns null for a row whose payload fails the schema', () => {
    // A line needs two points; one point is invalid for a trend-line.
    const bad = rowToDrawing({
      id: 'd1',
      kind: 'trend-line',
      geometry: { points: [], createdAt: 1, updatedAt: 1 },
      style: { color: '#fff', width: 1, lineStyle: 'solid' },
    });
    expect(bad).toBeNull();
  });
});
