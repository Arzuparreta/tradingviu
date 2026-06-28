import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Drawing } from '@tv/core';

// ── Re-export the project drawing type ──────────────────────────────────
export type { Drawing, DrawingTool } from '@tv/core';

// ── Chart surface abstraction ───────────────────────────────────────────

export interface ChartSurfaceHandle {
  readonly chart: IChartApi;
  readonly mainSeries: ISeriesApi<SeriesType>;
  fitContent(): void;
  setData(bars: readonly Bar[]): void;
}

/** Minimal bar shape consumed by the chart surface. */
export interface Bar {
  time: number; // UTCTimestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ── Drawing manager abstraction ─────────────────────────────────────────

/**
 * High-level interface for the drawing system. Every consumer (ChartPage,
 * LayoutPage) talks to this interface — never to a third-party class shape.
 */
export interface DrawingManager {
  /** Attach the manager to a chart surface. Must be called before any other method. */
  attach(surface: ChartSurfaceHandle): void;

  /** Detach from the chart surface and release resources. */
  detach(): void;

  /** Bulk-load drawings (e.g. from server). Replaces all existing drawings. */
  importDrawings(drawings: readonly Drawing[]): void;

  /** Export the current drawing set in the project's persisted shape. */
  exportDrawings(): Drawing[];

  /** Activate a tool for placement. The library tool type string (e.g. "trend-line"). */
  startTool(toolId: string): void;

  /** Cancel the active placement. If no placement is active, return to cursor mode. */
  cancelPlacement(): void;

  /** Select a drawing by id. Pass `null` to deselect. */
  select(id: string | null): void;

  /** Remove a drawing by id. */
  remove(id: string): void;

  /** Remove all drawings. */
  clear(): void;

  /** Lock or unlock a drawing. */
  setLocked(id: string, locked: boolean): void;

  /** Show or hide a drawing. */
  setVisible(id: string, visible: boolean): void;

  /** Configure magnet snapping mode for placement/edit interactions. */
  setMagnetMode?(mode: 'off' | 'weak' | 'strong'): void;

  /** Keep the active tool armed after a drawing is completed. */
  setStayInDrawingMode?(enabled: boolean): void;

  /** Move the selected drawing by a chart-space delta when supported. */
  moveSelection?(delta: { readonly time: number; readonly price: number }): void;

  /** Update one anchor of a drawing when supported. */
  updateAnchor?(id: string, index: number, anchor: { readonly time: unknown; readonly price: number }): void;

  /** Update the default style for newly created drawings. */
  setToolDefaultStyle?(style: Record<string, unknown>): void;

  /** Persist interval visibility preferences for a drawing when supported. */
  setVisibilityOnIntervals?(id: string, intervals: readonly string[]): void;

  /** Subscribe to drawing changes. Returns an unsubscribe function. */
  onChange(callback: (drawings: Drawing[]) => void): () => void;

  /** Returns whether a tool placement is currently active. */
  isPlacing(): boolean;

  /** Returns the id of the currently selected drawing, if any. */
  getSelectedId(): string | null;

  /** Returns the active tool type, or `null` if in cursor mode. */
  getActiveTool(): string | null;
}
