import type { Time } from 'lightweight-charts';
import type { Drawing } from '@tv/core';
import type { Anchor, DrawingStyle, SerializedDrawing } from 'lightweight-charts-drawing';

// ── Tool name mapping: our klinecharts name → library type ──────────────

const OUR_TO_LIBRARY: Record<string, string> = {
  segment: 'trend-line',
  line: 'trend-line',
  rayLine: 'ray',
  straightLine: 'extended-line',
  horizontalStraightLine: 'horizontal-line',
  verticalStraightLine: 'vertical-line',
  rect: 'rectangle',
  text: 'text-annotation',
  fibonacciLine: 'fib-retracement',
  parallelStraightLine: 'parallel-channel',
  priceChannelLine: 'parallel-channel',
  priceLine: 'horizontal-line',
};

const LIBRARY_TO_OUR: Record<string, string> = {
  'trend-line': 'segment',
  ray: 'rayLine',
  'extended-line': 'straightLine',
  'horizontal-line': 'horizontalStraightLine',
  'horizontal-ray': 'horizontalStraightLine',
  'vertical-line': 'verticalStraightLine',
  rectangle: 'rect',
  'text-annotation': 'text',
  'fib-retracement': 'fibonacciLine',
  'parallel-channel': 'priceChannelLine',
};

/** Map our persisted tool name to the library's type string. */
export const ourToolToLibraryType = (name: string): string =>
  OUR_TO_LIBRARY[name] ?? 'trend-line';

/** Map the library's type string back to our persisted tool name. */
export const libraryTypeToOurTool = (type: string): string =>
  LIBRARY_TO_OUR[type] ?? 'segment';

// ── Point conversion ────────────────────────────────────────────────────

/**
 * Convert our persisted point format to a library Anchor.
 * Our format: `{ timestamp?: number; dataIndex?: number; value?: number }`
 * Library format: `{ time: Time; price: number }`
 *
 * We only support timestamp-based points (not dataIndex) because the library
 * uses time/price for all its anchors.
 */
export const ourPointToAnchor = (point: Drawing['points'][number]): Anchor | null => {
  if (typeof point.timestamp !== 'number' || !Number.isFinite(point.timestamp)) return null;
  if (typeof point.value !== 'number' || !Number.isFinite(point.value)) return null;
  return {
    time: (point.timestamp / 1000) as Time,
    price: point.value,
  };
};

export const anchorToOurPoint = (anchor: Anchor): Drawing['points'][number] => {
  const timeSec = typeof anchor.time === 'number' ? anchor.time : Number(anchor.time);
  return {
    timestamp: Number.isFinite(timeSec) ? Math.round(timeSec * 1000) : undefined,
    value: anchor.price,
  };
};

// ── Style conversion ────────────────────────────────────────────────────

const DEFAULT_LIBRARY_STYLE: DrawingStyle = {
  lineColor: '#f5c542',
  lineWidth: 2,
  fillColor: 'rgba(245,197,66,0.12)',
  fillOpacity: 0.12,
};

const extractStyle = (drawing: Drawing): DrawingStyle => {
  const styles = drawing.styles as Record<string, unknown> | null;
  const line = styles?.line as Record<string, unknown> | undefined;
  const polygon = styles?.polygon as Record<string, unknown> | undefined;
  const text = styles?.text as Record<string, unknown> | undefined;

  const color = typeof line?.color === 'string' ? line.color : DEFAULT_LIBRARY_STYLE.lineColor;
  const width = typeof line?.size === 'number' ? line.size : DEFAULT_LIBRARY_STYLE.lineWidth;
  const dashStyle = typeof line?.style === 'string' && line.style === 'dashed' ? [6, 4] : undefined;
  const fillColor = typeof polygon?.color === 'string'
    ? polygon.color
    : DEFAULT_LIBRARY_STYLE.fillColor;

  const result: DrawingStyle = {
    lineColor: color,
    lineWidth: width,
    fillColor: fillColor ?? 'rgba(245,197,66,0.12)',
    fillOpacity: 0.12,
  };
  if (dashStyle) {
    result.lineDash = dashStyle;
  }
  if (text?.color && typeof text.color === 'string') {
    (result as unknown as Record<string, unknown>).labelColor = text.color;
  }
  return result;
};

// ── Full drawing conversion ─────────────────────────────────────────────

/**
 * Convert our persisted Drawing to the library's SerializedDrawing format.
 */
export const ourDrawingToLibrary = (drawing: Drawing): SerializedDrawing | null => {
  const libType = ourToolToLibraryType(drawing.name);
  const anchors: Anchor[] = [];
  for (const pt of drawing.points) {
    const anchor = ourPointToAnchor(pt);
    if (anchor) anchors.push(anchor);
  }
  if (anchors.length === 0) return null;

  return {
    id: drawing.id,
    type: libType,
    anchors,
    style: extractStyle(drawing),
    options: {
      visible: drawing.visible !== false,
      locked: drawing.lock === true,
      zIndex: drawing.zLevel ?? 0,
      extendLeft: libType === 'extended-line' || libType === 'ray',
      extendRight: libType === 'extended-line' || libType === 'ray',
    },
  };
};

/**
 * Convert the library's SerializedDrawing back to our persisted Drawing format.
 */
export const libraryToOurDrawing = (ser: SerializedDrawing): Drawing => {
  const now = Date.now();
  return {
    engine: 'klinecharts',
    id: ser.id,
    name: libraryTypeToOurTool(ser.type),
    points: ser.anchors.map(anchorToOurPoint),
    styles: {
      line: {
        color: ser.style.lineColor,
        size: ser.style.lineWidth,
        style: ser.style.lineDash ? 'dashed' : 'solid',
      },
      polygon: {
        color: ser.style.fillColor ?? 'rgba(245,197,66,0.12)',
        borderColor: ser.style.lineColor,
        borderSize: ser.style.lineWidth,
      },
      text: {
        color: (ser.style as unknown as Record<string, unknown>).labelColor as string ?? ser.style.lineColor,
        size: 14,
      },
    },
    mode: 'normal',
    lock: ser.options.locked === true,
    visible: ser.options.visible !== false,
    zLevel: ser.options.zIndex ?? 0,
    extendData: undefined,
    createdAt: now,
    updatedAt: now,
  };
};
