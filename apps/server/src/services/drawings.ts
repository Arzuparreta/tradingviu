import { DrawingSchema, legacyDrawingToKLine, type Drawing } from '@tv/drawing-tools';

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
