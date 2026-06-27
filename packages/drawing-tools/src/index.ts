export {
  KLINE_OVERLAY_NAMES,
  DrawingToolSchema,
  KLineOverlayPointSchema,
  KLineDrawingSchema,
  DrawingSchema,
  DrawingsSchema,
  type DrawingTool,
  type KLineOverlayPoint,
  type KLineDrawing,
  type Drawing,
} from '@tv/core';

// ── New drawing-manager wrapper ────────────────────────────────────────
export { LwcDrawingManager } from './drawing-manager';
export type {
  DrawingManager,
  ChartSurfaceHandle,
  Bar,
} from './types';
export {
  ourToolToLibraryType,
  libraryTypeToOurTool,
  ourDrawingToLibrary,
  libraryToOurDrawing,
} from './convert';
import {
  DrawingSchema,
  DrawingsSchema,
  KLineDrawingSchema,
  type Drawing,
  type DrawingTool,
  type KLineDrawing,
  type KLineOverlayPoint,
} from '@tv/core';

export const DEFAULT_DRAWING_STYLE = {
  color: '#f5c542',
  width: 2,
  lineStyle: 'solid',
} as const;
export type DrawingStyle = typeof DEFAULT_DRAWING_STYLE;

export interface DrawingToolGroup {
  readonly id: string;
  readonly label: string;
  readonly tools: readonly (readonly [DrawingTool, string])[];
}

export const KLINE_TOOL_GROUPS: readonly DrawingToolGroup[] = [
  {
    id: 'lines',
    label: 'Lines',
    tools: [
      ['cursor', 'Cursor'],
      ['segment', 'Trend line'],
      ['rayLine', 'Ray'],
      ['straightLine', 'Extended line'],
      ['horizontalStraightLine', 'Horizontal line'],
      ['horizontalRayLine', 'Horizontal ray'],
      ['verticalStraightLine', 'Vertical line'],
      ['crossLine', 'Cross line'],
      ['infoLine', 'Info line'],
      ['trendAngle', 'Trend angle'],
      ['arrow', 'Arrow'],
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    tools: [
      ['priceChannelLine', 'Parallel channel'],
      ['regressionTrend', 'Regression trend'],
      ['flatTopBottom', 'Flat top/bottom'],
      ['disjointChannel', 'Disjoint channel'],
    ],
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci',
    tools: [
      ['fibonacciLine', 'Fib retracement'],
      ['fibExtension', 'Fib extension'],
      ['fibChannel', 'Fib channel'],
      ['fibTimeZone', 'Fib time zone'],
      ['fibSpeedFan', 'Fib speed fan'],
      ['fibTimeExtension', 'Fib time extension'],
      ['fibCircles', 'Fib circles'],
      ['fibSpiral', 'Fib spiral'],
      ['fibArcs', 'Fib arcs'],
      ['fibWedge', 'Fib wedge'],
      ['pitchfan', 'Pitchfan'],
    ],
  },
  {
    id: 'pitchfork-gann',
    label: 'Pitchfork / Gann',
    tools: [
      ['andrewsPitchfork', 'Andrews pitchfork'],
      ['schiffPitchfork', 'Schiff pitchfork'],
      ['modifiedSchiffPitchfork', 'Modified Schiff'],
      ['insidePitchfork', 'Inside pitchfork'],
      ['gannBox', 'Gann box'],
      ['gannFan', 'Gann fan'],
      ['gannSquareFixed', 'Gann fixed square'],
      ['gannSquare', 'Gann square'],
    ],
  },
  {
    id: 'measure',
    label: 'Measure',
    tools: [
      ['priceRange', 'Price range'],
      ['dateRange', 'Date range'],
      ['datePriceRange', 'Date and price range'],
      ['projection', 'Projection'],
      ['forecast', 'Forecast'],
      ['barsPattern', 'Bars pattern'],
      ['longPosition', 'Long position'],
      ['shortPosition', 'Short position'],
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    tools: [
      ['rect', 'Rectangle'],
      ['circle', 'Circle'],
      ['triangle', 'Triangle'],
      ['ellipse', 'Ellipse'],
      ['arc', 'Arc'],
      ['rotatedRectangle', 'Rotated rectangle'],
      ['path', 'Path'],
      ['polyline', 'Polyline'],
      ['curve', 'Curve'],
      ['doubleCurve', 'Double curve'],
    ],
  },
  {
    id: 'annotations',
    label: 'Annotations',
    tools: [
      ['text', 'Text'],
      ['callout', 'Callout'],
      ['anchoredText', 'Anchored text'],
      ['note', 'Note'],
      ['priceNote', 'Price note'],
      ['priceLabel', 'Price label'],
      ['flag', 'Flag'],
      ['pin', 'Pin'],
      ['comment', 'Comment'],
      ['signpost', 'Signpost'],
      ['table', 'Table'],
      ['brush', 'Brush'],
      ['highlighter', 'Highlighter'],
      ['arrowMarker', 'Arrow marker'],
      ['arrowUp', 'Arrow up'],
      ['arrowDown', 'Arrow down'],
    ],
  },
];

export const KLINE_TOOL_LABELS: readonly (readonly [DrawingTool, string])[] =
  KLINE_TOOL_GROUPS.flatMap((group) => group.tools);

export const toolCreatesDrawing = (tool: DrawingTool): boolean => tool !== 'cursor';

const legacyNameMap: Record<string, string> = {
  'trend-line': 'segment',
  ray: 'rayLine',
  'extended-line': 'straightLine',
  'horizontal-line': 'horizontalStraightLine',
  'vertical-line': 'verticalStraightLine',
  rectangle: 'rect',
  text: 'text',
};

const legacyLineStyleMap: Record<string, string> = {
  solid: 'solid',
  dashed: 'dashed',
  dotted: 'dashed',
};

export const legacyDrawingToKLine = (input: unknown): KLineDrawing | null => {
  if (input === null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const name = legacyNameMap[kind];
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  if (!name || rawPoints.length === 0) return null;
  const points: KLineOverlayPoint[] = [];
  for (const p of rawPoints) {
    if (p !== null && typeof p === 'object') {
      const rp = p as Record<string, unknown>;
      const time = typeof rp.time === 'number' && Number.isFinite(rp.time) ? rp.time : null;
      const price = typeof rp.price === 'number' && Number.isFinite(rp.price) ? rp.price : null;
      if (time !== null && price !== null) points.push({ timestamp: time * 1000, value: price });
    }
  }
  if (points.length === 0) return null;
  const style = raw.style && typeof raw.style === 'object' ? (raw.style as Record<string, unknown>) : {};
  const color = typeof style.color === 'string' ? style.color : DEFAULT_DRAWING_STYLE.color;
  const width = typeof style.width === 'number' ? style.width : DEFAULT_DRAWING_STYLE.width;
  const lineStyle = typeof style.lineStyle === 'string' ? style.lineStyle : DEFAULT_DRAWING_STYLE.lineStyle;
  const now = Date.now();
  return {
    engine: 'klinecharts',
    id: typeof raw.id === 'string' && raw.id ? raw.id : `kl${now.toString(36)}`,
    name,
    points,
    styles: {
      line: {
        color,
        size: width,
        style: legacyLineStyleMap[lineStyle] ?? 'solid',
      },
      polygon: {
        color: typeof style.fillColor === 'string' ? style.fillColor : `${color}22`,
        borderColor: color,
        borderSize: width,
      },
      text: {
        color: typeof style.textColor === 'string' ? style.textColor : color,
      },
    },
    mode: 'normal',
    lock: false,
    visible: true,
    zLevel: 0,
    extendData: typeof raw.text === 'string' ? { text: raw.text } : undefined,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
};

export const normalizeDrawings = (input: unknown): Drawing[] => {
  const parsed = DrawingsSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const kline = KLineDrawingSchema.safeParse(item);
      if (kline.success) return kline.data;
      return legacyDrawingToKLine(item);
    })
    .filter((drawing): drawing is Drawing => drawing !== null);
};
