import { z } from 'zod';

export const DrawingKindSchema = z.enum([
  'trend-line',
  'ray',
  'extended-line',
  'horizontal-line',
  'vertical-line',
  'rectangle',
  'text',
]);
export type DrawingKind = z.infer<typeof DrawingKindSchema>;

export const DrawingToolSchema = z.enum([
  'cursor',
  'select',
  'trend-line',
  'ray',
  'extended-line',
  'horizontal-line',
  'vertical-line',
  'rectangle',
  'text',
]);
export type DrawingTool = z.infer<typeof DrawingToolSchema>;

export const DrawingPointSchema = z.object({
  time: z.number().finite(),
  price: z.number().finite(),
});
export type DrawingPoint = z.infer<typeof DrawingPointSchema>;

export const DrawingStyleSchema = z.object({
  color: z.string().min(1).max(40).default('#f5c542'),
  width: z.number().int().min(1).max(8).default(2),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  fillColor: z.string().min(1).max(40).optional(),
  textColor: z.string().min(1).max(40).optional(),
});
export type DrawingStyle = z.infer<typeof DrawingStyleSchema>;

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#f5c542',
  width: 2,
  lineStyle: 'solid',
};

export const DrawingSchema = z.object({
  id: z.string().min(1).max(80),
  kind: DrawingKindSchema,
  points: z.array(DrawingPointSchema).min(1).max(2),
  text: z.string().max(500).optional(),
  style: DrawingStyleSchema.default(DEFAULT_DRAWING_STYLE),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Drawing = z.infer<typeof DrawingSchema>;

export const DrawingsSchema = z.array(DrawingSchema).max(500);

export const normalizeDrawings = (input: unknown): Drawing[] => DrawingsSchema.catch([]).parse(input);

export const toolCreatesDrawing = (tool: DrawingTool): tool is DrawingKind =>
  tool !== 'cursor' && tool !== 'select';

export const requiredPointCount = (kind: DrawingKind): 1 | 2 => {
  switch (kind) {
    case 'horizontal-line':
    case 'vertical-line':
    case 'text':
      return 1;
    case 'trend-line':
    case 'ray':
    case 'extended-line':
    case 'rectangle':
      return 2;
  }
};

export const isLineLike = (kind: DrawingKind): kind is 'trend-line' | 'ray' | 'extended-line' =>
  kind === 'trend-line' || kind === 'ray' || kind === 'extended-line';

export const makeDrawing = (kind: DrawingKind, points: readonly DrawingPoint[], style: DrawingStyle, text?: string): Drawing => {
  const now = Date.now();
  const drawing: Drawing = {
    id: `d${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    kind,
    points: points.slice(0, requiredPointCount(kind)),
    style: { ...DEFAULT_DRAWING_STYLE, ...style },
    createdAt: now,
    updatedAt: now,
  };
  if (text !== undefined) drawing.text = text;
  return drawing;
};

export const lineDashFor = (style: DrawingStyle): string | undefined => {
  switch (style.lineStyle) {
    case 'solid':
      return undefined;
    case 'dashed':
      return '8 6';
    case 'dotted':
      return '2 5';
  }
  return undefined;
};

export interface ScreenPoint {
  x: number;
  y: number;
}

export const distanceToSegment = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
