import { z } from 'zod';

export const KLINE_OVERLAY_NAMES = [
  'segment',
  'line',
  'rayLine',
  'straightLine',
  'horizontalSegment',
  'horizontalRayLine',
  'horizontalStraightLine',
  'verticalSegment',
  'verticalRayLine',
  'verticalStraightLine',
  'rect',
  'text',
  'fibonacciLine',
  'parallelStraightLine',
  'priceChannelLine',
  'priceLine',
  'circle',
  'arc',
  'polygon',
  'simpleAnnotation',
  'simpleTag',
] as const;

export const DrawingToolSchema = z.enum([
  'cursor',
  'segment',
  'line',
  'rayLine',
  'straightLine',
  'horizontalStraightLine',
  'verticalStraightLine',
  'rect',
  'text',
  'fibonacciLine',
  'parallelStraightLine',
  'priceChannelLine',
  'priceLine',
]);
export type DrawingTool = z.infer<typeof DrawingToolSchema>;

export const KLineOverlayPointSchema = z.object({
  timestamp: z.number().finite().optional(),
  dataIndex: z.number().finite().optional(),
  value: z.number().finite().optional(),
});
export type KLineOverlayPoint = z.infer<typeof KLineOverlayPointSchema>;

export const KLineDrawingSchema = z.object({
  engine: z.literal('klinecharts').default('klinecharts'),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  groupId: z.string().min(1).max(120).optional(),
  points: z.array(KLineOverlayPointSchema).max(20).default([]),
  styles: z.record(z.unknown()).nullable().optional(),
  mode: z.enum(['normal', 'weak_magnet', 'strong_magnet']).default('normal'),
  lock: z.boolean().default(false),
  visible: z.boolean().default(true),
  zLevel: z.number().int().default(0),
  extendData: z.unknown().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type KLineDrawing = z.infer<typeof KLineDrawingSchema>;

export const DrawingSchema = KLineDrawingSchema;
export type Drawing = KLineDrawing;
export const DrawingsSchema = z.array(DrawingSchema).max(500);

export const DEFAULT_DRAWING_STYLE = {
  color: '#f5c542',
  width: 2,
  lineStyle: 'solid',
} as const;
export type DrawingStyle = typeof DEFAULT_DRAWING_STYLE;

export const KLINE_TOOL_LABELS: readonly (readonly [DrawingTool, string])[] = [
  ['cursor', 'Cursor'],
  ['segment', 'Trend line'],
  ['line', 'Line'],
  ['rayLine', 'Ray'],
  ['straightLine', 'Extended'],
  ['horizontalStraightLine', 'Horizontal'],
  ['verticalStraightLine', 'Vertical'],
  ['rect', 'Rectangle'],
  ['text', 'Text'],
  ['fibonacciLine', 'Fib'],
  ['parallelStraightLine', 'Parallel'],
  ['priceChannelLine', 'Channel'],
  ['priceLine', 'Price'],
];

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
