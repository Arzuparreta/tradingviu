import { describe, expect, test } from 'bun:test';
import { getToolRegistry, type Anchor } from 'lightweight-charts-drawing';
import {
  DrawingSchema,
  KLINE_TOOL_LABELS,
  legacyDrawingToKLine,
  libraryToOurDrawing,
  normalizeDrawings,
  ourDrawingToLibrary,
  ourToolToLibraryType,
  toolCreatesDrawing,
} from './index.js';
import type { Drawing, DrawingTool } from './index.js';

const anchor = (index: number): Anchor => ({
  time: (1_700_000_000 + index * 3_600) as Anchor['time'],
  price: 100 + index * 5,
});

const drawingForTool = (tool: DrawingTool, anchorCount: number): Drawing => ({
  engine: 'klinecharts',
  id: `d-${tool}`,
  name: tool,
  points: Array.from({ length: anchorCount }, (_, index) => ({
    timestamp: (1_700_000_000 + index * 3_600) * 1000,
    value: 100 + index * 5,
  })),
  styles: { line: { color: '#f5c542', size: 2 } },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 1,
});

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

  test('toolbar tools map to registered lightweight drawing tools', () => {
    const registry = getToolRegistry();
    const toolEntries = KLINE_TOOL_LABELS.filter(([tool]) => tool !== 'cursor');

    expect(toolEntries.length).toBeGreaterThan(50);

    for (const [tool] of toolEntries) {
      const libraryType = ourToolToLibraryType(tool);
      const definition = registry.get(libraryType);
      expect(definition, `${tool} maps to ${libraryType}`).toBeDefined();
      expect(definition?.requiredAnchors ?? 0, `${tool} requires anchors`).toBeGreaterThan(0);
    }
  });

  test('toolbar tools create and round-trip through the persisted drawing shape', () => {
    const registry = getToolRegistry();

    for (const [tool] of KLINE_TOOL_LABELS) {
      if (tool === 'cursor') continue;
      const libraryType = ourToolToLibraryType(tool);
      const requiredAnchors = registry.get(libraryType)?.requiredAnchors;
      expect(requiredAnchors, `${tool} has required anchors`).toBeDefined();

      const anchors = Array.from({ length: requiredAnchors ?? 0 }, (_, index) => anchor(index));
      const libraryDrawing = registry.createDrawing(libraryType, `lib-${tool}`, anchors);
      expect(libraryDrawing, `${tool} creates a library drawing`).not.toBeNull();

      const persisted = drawingForTool(tool, requiredAnchors ?? 0);
      const serialized = ourDrawingToLibrary(persisted);
      expect(serialized?.type, `${tool} serializes to the expected library type`).toBe(libraryType);
      expect(serialized?.anchors.length, `${tool} preserves anchor count`).toBe(requiredAnchors);

      const roundTrip = libraryToOurDrawing(serialized!);
      expect(roundTrip.name, `${tool} round-trips to its canonical project name`).toBe(tool);
      expect(roundTrip.points).toHaveLength(requiredAnchors ?? 0);
    }
  });
});
