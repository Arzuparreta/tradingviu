import type { Time } from 'lightweight-charts';
import type { Drawing } from '@tv/core';
import type { Anchor, DrawingStyle, SerializedDrawing } from 'lightweight-charts-drawing';

// ── Tool name mapping: our klinecharts name → library type ──────────────

const OUR_TO_LIBRARY: Record<string, string> = {
  cursor: '',
  // Lines
  segment: 'trend-line',
  line: 'trend-line',
  rayLine: 'ray',
  straightLine: 'extended-line',
  horizontalStraightLine: 'horizontal-line',
  horizontalRayLine: 'horizontal-ray',
  verticalStraightLine: 'vertical-line',
  crossLine: 'cross-line',
  trendAngle: 'trend-angle',
  infoLine: 'info-line',
  // Channels
  parallelStraightLine: 'parallel-channel',
  priceChannelLine: 'parallel-channel',
  regressionTrend: 'regression-trend',
  flatTopBottom: 'flat-top-bottom',
  disjointChannel: 'disjoint-channel',
  // Pitchforks
  andrewsPitchfork: 'andrews-pitchfork',
  schiffPitchfork: 'schiff-pitchfork',
  modifiedSchiffPitchfork: 'modified-schiff-pitchfork',
  insidePitchfork: 'inside-pitchfork',
  // Fibonacci
  fibonacciLine: 'fib-retracement',
  fibExtension: 'fib-extension',
  fibChannel: 'fib-channel',
  fibTimeZone: 'fib-time-zone',
  fibSpeedFan: 'fib-speed-fan',
  fibTimeExtension: 'fib-time-extension',
  fibCircles: 'fib-circles',
  fibSpiral: 'fib-spiral',
  fibArcs: 'fib-arcs',
  fibWedge: 'fib-wedge',
  pitchfan: 'pitchfan',
  // Gann
  gannFan: 'gann-fan',
  gannBox: 'gann-box',
  gannSquare: 'gann-square',
  gannSquareFixed: 'gann-square-fixed',
  // Shapes
  rect: 'rectangle',
  rotatedRectangle: 'rotated-rectangle',
  circle: 'circle',
  triangle: 'triangle',
  ellipse: 'ellipse',
  arc: 'arc',
  path: 'path',
  polyline: 'polyline',
  curve: 'curve',
  doubleCurve: 'double-curve',
  // Annotations
  text: 'text-annotation',
  callout: 'callout',
  anchoredText: 'anchored-text',
  note: 'note',
  priceLabel: 'price-label',
  priceNote: 'price-note',
  flag: 'flag-mark',
  pin: 'pin',
  comment: 'comment',
  signpost: 'signpost',
  table: 'table',
  // Brush / markers
  brush: 'brush',
  highlighter: 'highlighter',
  arrow: 'arrow',
  arrowMarker: 'arrow-marker',
  arrowUp: 'arrow-mark-up',
  arrowDown: 'arrow-mark-down',
  // Trading
  priceLine: 'horizontal-line',
  priceRange: 'price-range',
  dateRange: 'date-range',
  datePriceRange: 'date-price-range',
  longPosition: 'long-position',
  shortPosition: 'short-position',
  forecast: 'forecast',
  projection: 'projection',
  barsPattern: 'bars-pattern',
};

const LIBRARY_TO_OUR: Record<string, string> = {
  // Lines
  'trend-line': 'segment',
  ray: 'rayLine',
  'extended-line': 'straightLine',
  'horizontal-line': 'horizontalStraightLine',
  'horizontal-ray': 'horizontalRayLine',
  'vertical-line': 'verticalStraightLine',
  'cross-line': 'crossLine',
  'trend-angle': 'trendAngle',
  'info-line': 'infoLine',
  // Channels
  'parallel-channel': 'priceChannelLine',
  'regression-trend': 'regressionTrend',
  'flat-top-bottom': 'flatTopBottom',
  'disjoint-channel': 'disjointChannel',
  // Pitchforks
  'andrews-pitchfork': 'andrewsPitchfork',
  'schiff-pitchfork': 'schiffPitchfork',
  'modified-schiff-pitchfork': 'modifiedSchiffPitchfork',
  'inside-pitchfork': 'insidePitchfork',
  // Fibonacci
  'fib-retracement': 'fibonacciLine',
  'fib-extension': 'fibExtension',
  'fib-channel': 'fibChannel',
  'fib-time-zone': 'fibTimeZone',
  'fib-speed-fan': 'fibSpeedFan',
  'fib-time-extension': 'fibTimeExtension',
  'fib-circles': 'fibCircles',
  'fib-spiral': 'fibSpiral',
  'fib-arcs': 'fibArcs',
  'fib-wedge': 'fibWedge',
  pitchfan: 'pitchfan',
  // Gann
  'gann-fan': 'gannFan',
  'gann-box': 'gannBox',
  'gann-square': 'gannSquare',
  'gann-square-fixed': 'gannSquareFixed',
  // Shapes
  rectangle: 'rect',
  'rotated-rectangle': 'rotatedRectangle',
  circle: 'circle',
  triangle: 'triangle',
  ellipse: 'ellipse',
  arc: 'arc',
  path: 'path',
  polyline: 'polyline',
  curve: 'curve',
  'double-curve': 'doubleCurve',
  // Annotations
  'text-annotation': 'text',
  callout: 'callout',
  'anchored-text': 'anchoredText',
  note: 'note',
  'price-label': 'priceLabel',
  'price-note': 'priceNote',
  'flag-mark': 'flag',
  pin: 'pin',
  comment: 'comment',
  signpost: 'signpost',
  table: 'table',
  // Brush / markers
  brush: 'brush',
  highlighter: 'highlighter',
  arrow: 'arrow',
  'arrow-marker': 'arrowMarker',
  'arrow-mark-up': 'arrowUp',
  'arrow-mark-down': 'arrowDown',
  // Trading
  'price-range': 'priceRange',
  'date-range': 'dateRange',
  'date-price-range': 'datePriceRange',
  'long-position': 'longPosition',
  'short-position': 'shortPosition',
  forecast: 'forecast',
  projection: 'projection',
  'bars-pattern': 'barsPattern',
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
