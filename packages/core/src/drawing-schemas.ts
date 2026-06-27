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
