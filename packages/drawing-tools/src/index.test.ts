import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_DRAWING_STYLE,
  DrawingSchema,
  distanceToSegment,
  lineDashFor,
  makeDrawing,
  normalizeDrawings,
  requiredPointCount,
  toolCreatesDrawing,
} from './index.js';

describe('drawing schemas', () => {
  test('creates serializable drawings with defaults', () => {
    const drawing = makeDrawing('trend-line', [{ time: 1, price: 10 }, { time: 2, price: 11 }], DEFAULT_DRAWING_STYLE);
    expect(DrawingSchema.parse(drawing).kind).toBe('trend-line');
    expect(drawing.points).toHaveLength(2);
  });

  test('normalizes invalid drawing payloads to empty lists', () => {
    expect(normalizeDrawings({ nope: true })).toEqual([]);
  });
});

describe('drawing tool helpers', () => {
  test('classifies tools that create drawings', () => {
    expect(toolCreatesDrawing('cursor')).toBe(false);
    expect(toolCreatesDrawing('select')).toBe(false);
    expect(toolCreatesDrawing('rectangle')).toBe(true);
  });

  test('returns required point counts by drawing kind', () => {
    expect(requiredPointCount('horizontal-line')).toBe(1);
    expect(requiredPointCount('text')).toBe(1);
    expect(requiredPointCount('trend-line')).toBe(2);
    expect(requiredPointCount('rectangle')).toBe(2);
  });

  test('maps line styles to SVG dash arrays', () => {
    expect(lineDashFor({ color: '#fff', width: 1, lineStyle: 'solid' })).toBeUndefined();
    expect(lineDashFor({ color: '#fff', width: 1, lineStyle: 'dashed' })).toBe('8 6');
    expect(lineDashFor({ color: '#fff', width: 1, lineStyle: 'dotted' })).toBe('2 5');
  });
});

describe('geometry helpers', () => {
  test('measures distance to a segment', () => {
    expect(distanceToSegment({ x: 5, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(2);
    expect(distanceToSegment({ x: 12, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(2);
  });
});
