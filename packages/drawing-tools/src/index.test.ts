import { describe, expect, test } from 'bun:test';
import { getToolRegistry, type Anchor } from 'lightweight-charts-drawing';
import {
  DrawingSchema,
  DrawingDocumentV2Schema,
  KLINE_TOOL_LABELS,
  drawingAllowedOnInterval,
  legacyDrawingToKLine,
  libraryToOurDrawing,
  normalizeDrawings,
  ourDrawingToLibrary,
  ourToolToLibraryType,
  textFieldForTool,
  toolSupportsText,
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

  test('accepts versioned v2 drawing documents', () => {
    const doc = DrawingDocumentV2Schema.parse({
      version: 2,
      id: 'd2',
      tool: 'priceChannelLine',
      anchors: [
        { time: 1700000000, price: 100, logical: 1 },
        { time: 1700003600, price: 110, logical: 2 },
        { time: 1700000000, price: 105, logical: 1 },
        { time: 1700003600, price: 115, logical: 2 },
      ],
      syncMode: 'symbol',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(doc.version).toBe(2);
    expect(doc.anchors).toHaveLength(4);
    expect(doc.visibility.mode).toBe('all');
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

  test('enforces interval-scoped visibility config', () => {
    const base = drawingForTool('segment', 2);
    // No config → always visible.
    expect(drawingAllowedOnInterval(base, '1h')).toBe(true);
    // No interval context → always visible.
    expect(drawingAllowedOnInterval({ ...base, extendData: { visibility: { mode: 'only', intervals: ['4h'] } } }, null)).toBe(true);

    const onlyFourHour = { ...base, extendData: { visibility: { mode: 'only', intervals: ['4h', '1d'] } } };
    expect(drawingAllowedOnInterval(onlyFourHour, '4h')).toBe(true);
    expect(drawingAllowedOnInterval(onlyFourHour, '1h')).toBe(false);

    const exceptOneHour = { ...base, extendData: { visibility: { mode: 'except', intervals: ['1h'] } } };
    expect(drawingAllowedOnInterval(exceptOneHour, '1h')).toBe(false);
    expect(drawingAllowedOnInterval(exceptOneHour, '4h')).toBe(true);

    // Empty interval list falls back to always-visible.
    expect(drawingAllowedOnInterval({ ...base, extendData: { visibility: { mode: 'only', intervals: [] } } }, '1h')).toBe(true);
  });

  test('classifies text-bearing tools and their library option field', () => {
    expect(toolSupportsText('text')).toBe(true);
    expect(textFieldForTool('text')).toBe('text');
    expect(textFieldForTool('callout')).toBe('text');
    expect(textFieldForTool('note')).toBe('text');
    expect(textFieldForTool('flag')).toBe('label');
    expect(textFieldForTool('pin')).toBe('label');
    expect(toolSupportsText('segment')).toBe(false);
    expect(textFieldForTool('rect')).toBeNull();
  });

  test('round-trips text content through library options and extendData', () => {
    const textDrawing: Drawing = {
      ...drawingForTool('text', 1),
      extendData: { text: 'Buy zone' },
    };
    const serialized = ourDrawingToLibrary(textDrawing);
    expect(serialized?.type).toBe('text-annotation');
    expect((serialized?.options as Record<string, unknown>).text).toBe('Buy zone');

    const roundTrip = libraryToOurDrawing(serialized!);
    expect((roundTrip.extendData as { text?: string }).text).toBe('Buy zone');
  });

  test('round-trips flag label content through the label option field', () => {
    const flagDrawing: Drawing = {
      ...drawingForTool('flag', 1),
      extendData: { text: 'E' },
    };
    const serialized = ourDrawingToLibrary(flagDrawing);
    expect(serialized?.type).toBe('flag-mark');
    expect((serialized?.options as Record<string, unknown>).label).toBe('E');

    const roundTrip = libraryToOurDrawing(serialized!);
    expect((roundTrip.extendData as { text?: string }).text).toBe('E');
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
