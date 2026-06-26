import { DrawingSchema, type Drawing } from '@tv/drawing-tools';

/**
 * Maps between the client-facing `Drawing` shape and the `drawings` table.
 *
 * The table keeps `kind` and `style` in dedicated columns (so they stay
 * queryable) and the rest of the drawing — its geometry and client-side
 * timestamps — in the `geometry` jsonb column. The row `id` is the
 * client-generated drawing id, so a saved set round-trips with stable ids.
 */

interface DrawingGeometry {
  points: Drawing['points'];
  text?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DrawingColumns {
  id: string;
  kind: string;
  geometry: DrawingGeometry;
  style: Record<string, unknown>;
}

export interface DrawingRowLike {
  id: string;
  kind: string;
  geometry: unknown;
  style: unknown;
}

/** Split a `Drawing` into the table's columns. */
export const drawingToColumns = (d: Drawing): DrawingColumns => {
  const geometry: DrawingGeometry = {
    points: d.points,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
  if (d.text !== undefined) geometry.text = d.text;
  return {
    id: d.id,
    kind: d.kind,
    geometry,
    style: d.style as unknown as Record<string, unknown>,
  };
};

/** Rebuild a `Drawing` from a row, or `null` if the stored payload is invalid. */
export const rowToDrawing = (row: DrawingRowLike): Drawing | null => {
  const geo = row.geometry;
  if (geo === null || typeof geo !== 'object') return null;
  const g = geo as Partial<DrawingGeometry>;
  const candidate: Record<string, unknown> = {
    id: row.id,
    kind: row.kind,
    points: g.points,
    style: row.style,
    createdAt: g.createdAt ?? 0,
    updatedAt: g.updatedAt ?? 0,
  };
  if (g.text !== undefined) candidate.text = g.text;
  const parsed = DrawingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};
