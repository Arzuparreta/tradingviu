import { describe, expect, test } from 'bun:test';
import {
  DrawingSchema,
  legacyDrawingToKLine,
  normalizeDrawings,
  toolCreatesDrawing,
} from './index.js';

describe('drawing schemas', () => {
  test('accepts serializable kline overlay drawings', () => {
    const drawing = DrawingSchema.parse({
      engine: 'klinecharts',
      id: 'd1',
      name: 'segment',
      points: [
        { timestamp: 1700000000000, value: 100 },
        { timestamp: 1700003600000, value: 110 },
      ],
      styles: { line: { color: '#fff' } },
      createdAt: 1,
      updatedAt: 1,
    });
    expect(drawing.name).toBe('segment');
    expect(drawing.mode).toBe('normal');
  });

  test('normalizes invalid drawing payloads to empty lists', () => {
    expect(normalizeDrawings({ nope: true })).toEqual([]);
  });

  test('converts legacy drawings best effort', () => {
    const drawing = legacyDrawingToKLine({
      id: 'legacy1',
      kind: 'horizontal-line',
      points: [{ time: 1700000000, price: 10 }],
      style: { color: '#fff', width: 1, lineStyle: 'solid' },
      createdAt: 1,
      updatedAt: 1,
    });
    expect(drawing?.name).toBe('horizontalStraightLine');
    expect(drawing?.points[0]?.timestamp).toBe(1700000000000);
  });
});

describe('drawing tool helpers', () => {
  test('classifies tools that create drawings', () => {
    expect(toolCreatesDrawing('cursor')).toBe(false);
    expect(toolCreatesDrawing('rect')).toBe(true);
    expect(toolCreatesDrawing('fibonacciLine')).toBe(true);
  });
});
