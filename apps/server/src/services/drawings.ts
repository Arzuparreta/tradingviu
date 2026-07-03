import { DrawingSchema, type Drawing, type KLineOverlayPoint } from '@tv/core';

interface DrawingGeometry {
  engine: 'klinecharts';
  groupId?: string;
  points: Drawing['points'];
  mode: Drawing['mode'];
  lock: boolean;
  visible: boolean;
  zLevel: number;
  extendData?: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface DrawingColumns {
  id: string;
  kind: string;
  geometry: DrawingGeometry;
  style: Record<string, unknown> | null;
}

export interface DrawingRowLike {
  id: string;
  kind: string;
  geometry: unknown;
  style: unknown;
}

// ── Legacy row support ───────────────────────────────────────────────────
// Rows written by the retired lightweight-charts engine store `kind` names and
// second-precision `{time, price}` points. Convert on read so old drawings
// keep rendering; new writes are always engine:'klinecharts'.

const LEGACY_NAME_MAP: Record<string, string> = {
  'trend-line': 'segment',
  ray: 'rayLine',
  'extended-line': 'straightLine',
  'horizontal-line': 'horizontalStraightLine',
  'vertical-line': 'verticalStraightLine',
  rectangle: 'rect',
  text: 'text',
};

const LEGACY_FALLBACK_COLOR = '#f5c542';

const legacyDrawingToKLine = (input: unknown): Drawing | null => {
  if (input === null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const name = LEGACY_NAME_MAP[kind];
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
  const color = typeof style.color === 'string' ? style.color : LEGACY_FALLBACK_COLOR;
  const width = typeof style.width === 'number' ? style.width : 2;
  const lineStyle = style.lineStyle === 'dashed' || style.lineStyle === 'dotted' ? 'dashed' : 'solid';
  const now = Date.now();
  return {
    engine: 'klinecharts',
    id: typeof raw.id === 'string' && raw.id ? raw.id : `kl${now.toString(36)}`,
    name,
    points,
    styles: {
      line: { color, size: width, style: lineStyle },
      polygon: {
        color: typeof style.fillColor === 'string' ? style.fillColor : `${color}22`,
        borderColor: color,
        borderSize: width,
      },
      text: { color: typeof style.textColor === 'string' ? style.textColor : color },
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

export const drawingToColumns = (d: Drawing): DrawingColumns => {
  const geometry: DrawingGeometry = {
    engine: 'klinecharts',
    points: d.points,
    mode: d.mode,
    lock: d.lock,
    visible: d.visible,
    zLevel: d.zLevel,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
  if (d.groupId !== undefined) geometry.groupId = d.groupId;
  if (d.extendData !== undefined) geometry.extendData = d.extendData;
  return {
    id: d.id,
    kind: d.name,
    geometry,
    style: d.styles === null || d.styles === undefined ? null : (d.styles as Record<string, unknown>),
  };
};

export const rowToDrawing = (row: DrawingRowLike): Drawing | null => {
  const geo = row.geometry;
  if (geo === null || typeof geo !== 'object') return null;
  const g = geo as Partial<DrawingGeometry> & Record<string, unknown>;
  if (g.engine !== 'klinecharts') {
    return legacyDrawingToKLine({
      id: row.id,
      kind: row.kind,
      points: g.points,
      text: g.text,
      style: row.style,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    });
  }
  const candidate: Record<string, unknown> = {
    engine: 'klinecharts',
    id: row.id,
    name: row.kind,
    groupId: g.groupId,
    points: g.points,
    styles: row.style,
    mode: g.mode,
    lock: g.lock,
    visible: g.visible,
    zLevel: g.zLevel,
    extendData: g.extendData,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
  const parsed = DrawingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};
