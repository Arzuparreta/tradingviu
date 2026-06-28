import {
  DrawingManager as LibDrawingManager,
  InteractionHandler,
  getToolRegistry,
  type MouseEventData,
  type InteractionConfig,
  type Anchor,
} from 'lightweight-charts-drawing';
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import type { Drawing } from '@tv/core';
import type { DrawingManager as IDrawingManager, ChartSurfaceHandle } from './types';
import { ourDrawingToLibrary, libraryToOurDrawing, anchorToOurPoint } from './convert';

// ── Fresh id generator ──────────────────────────────────────────────────

let idCounter = 0;
const freshId = (): string => `lcd_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

// ── Default style for new drawings ──────────────────────────────────────

const DEFAULT_STYLE = {
  lineColor: '#f5c542',
  lineWidth: 2,
  fillColor: 'rgba(245,197,66,0.12)',
  fillOpacity: 0.12,
  textColor: '#f5c542',
  textSize: 14,
};
type DefaultDrawingStyle = typeof DEFAULT_STYLE;

interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

type DragKind = 'body' | 'anchor';

interface ActiveDrag {
  readonly kind: DragKind;
  readonly drawingId: string;
  readonly anchorIndex: number | null;
  readonly startPoint: PixelPoint;
  readonly original: Drawing;
  moved: boolean;
}

const CHANNEL_TOOLS = new Set(['priceChannelLine', 'parallelStraightLine', 'regressionTrend', 'flatTopBottom', 'disjointChannel', 'fibChannel']);
const BOUNDED_TOOLS = new Set([
  'rect',
  'rotatedRectangle',
  'circle',
  'ellipse',
  'triangle',
  'arc',
  'priceRange',
  'dateRange',
  'datePriceRange',
  'longPosition',
  'shortPosition',
  'projection',
  'forecast',
  'barsPattern',
  'gannBox',
  'gannSquare',
  'gannSquareFixed',
]);
// Library tool types that accept an open-ended number of anchors: the user keeps
// clicking to add vertices and finishes with Enter or a double-click.
const MULTI_POINT_TOOLS = new Set(['path', 'polyline', 'brush', 'highlighter']);
const MULTI_POINT_MAX_ANCHORS = 512;
const MULTI_POINT_DEDUPE_PX = 4;
const HANDLE_RADIUS = 7;
const HIT_THRESHOLD = 9;

const cloneDrawing = (drawing: Drawing): Drawing => ({
  ...drawing,
  points: drawing.points.map((point) => ({ ...point })),
  styles:
    drawing.styles === null || drawing.styles === undefined
      ? drawing.styles
      : (JSON.parse(JSON.stringify(drawing.styles)) as Drawing['styles']),
  extendData:
    drawing.extendData === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(drawing.extendData)) as Drawing['extendData']),
});

const cloneDrawings = (drawings: readonly Drawing[]): Drawing[] => drawings.map(cloneDrawing);

const pointDistance = (a: PixelPoint, b: PixelPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Whether a drawing should render on the given chart interval, based on its
 * persisted `extendData.visibility` config (`{ mode, intervals }`).
 */
export const drawingAllowedOnInterval = (drawing: Drawing, interval: string | null): boolean => {
  if (!interval) return true;
  const extend = drawing.extendData;
  if (!extend || typeof extend !== 'object' || Array.isArray(extend)) return true;
  const visibility = (extend as Record<string, unknown>).visibility;
  if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) return true;
  const vis = visibility as { mode?: unknown; intervals?: unknown };
  const mode = vis.mode === 'only' || vis.mode === 'except' ? vis.mode : 'all';
  const intervals = Array.isArray(vis.intervals) ? vis.intervals.filter((i): i is string => typeof i === 'string') : [];
  if (mode === 'all' || intervals.length === 0) return true;
  return mode === 'only' ? intervals.includes(interval) : !intervals.includes(interval);
};

const distanceToSegment = (point: PixelPoint, start: PixelPoint, end: PixelPoint): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  return pointDistance(point, { x: start.x + t * dx, y: start.y + t * dy });
};

const isInsidePolygonBounds = (point: PixelPoint, points: readonly PixelPoint[]): boolean => {
  if (points.length === 0) return false;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return point.x >= Math.min(...xs) && point.x <= Math.max(...xs) && point.y >= Math.min(...ys) && point.y <= Math.max(...ys);
};

const expandedChannelPoints = (anchors: readonly Anchor[]): Anchor[] => {
  if (anchors.length < 3) return [...anchors];
  if (anchors.length >= 4) return [...anchors];
  const [a0, a1, a2] = anchors;
  if (!a0 || !a1 || !a2) return [...anchors];
  const t0 = Number(a0.time);
  const t1 = Number(a1.time);
  const t2 = Number(a2.time);
  const t3 = Number.isFinite(t0) && Number.isFinite(t1) && Number.isFinite(t2) ? t1 + (t2 - t0) : t1;
  return [
    ...anchors,
    {
      time: t3 as Time,
      price: a1.price + (a2.price - a0.price),
    },
  ];
};

// ── Implementation ──────────────────────────────────────────────────────

/**
 * Concrete implementation of the project's DrawingManager interface,
 * wrapping `lightweight-charts-drawing` primitives.
 *
 * Responsibilities:
 *  - Storage and lifecycle of drawings as lightweight-charts primitives
 *  - Tool placement via the library's InteractionHandler state machine
 *  - Selection and anchor dragging via the library's DrawingManager
 *  - Import/export with our persisted Drawing format
 *  - Event dispatch so the React layer can sync
 */
export class LwcDrawingManager implements IDrawingManager {
  private _libManager: LibDrawingManager | null = null;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _container: HTMLElement | null = null;

  // Interaction state
  private _interaction: InteractionHandler | null = null;
  private _activeTool: string | null = null;
  private _requiredAnchors = 0;
  private _isAttached = false;
  private _magnetMode: 'off' | 'weak' | 'strong' = 'off';
  private _stayInDrawingMode = false;
  private _defaultStyle: DefaultDrawingStyle = DEFAULT_STYLE;
  private _drawingCache: Drawing[] = [];
  private _currentInterval: string | null = null;
  private _suppressLibEvents = false;
  private _activeDrag: ActiveDrag | null = null;
  private _previewCanvas: HTMLCanvasElement | null = null;
  private _lastPreviewPoint: PixelPoint | null = null;

  // Subscriptions
  private _changeCallbacks: Array<(drawings: Drawing[]) => void> = [];
  private _selectionCallbacks: Array<(id: string | null) => void> = [];
  private _unsubLib: Array<() => void> = [];

  // ── Lifecycle ───────────────────────────────────────────────────────

  attach(surface: ChartSurfaceHandle): void {
    if (this._isAttached) this.detach();

    this._chart = surface.chart;
    this._series = surface.mainSeries;

    // Find the chart container DOM element
    const el: HTMLElement = surface.chart.chartElement();
    if (!el) throw new Error('Chart container element not found');
    this._container = el;

    // Create the library's DrawingManager for storage + selection
    this._libManager = new LibDrawingManager();
    this._libManager.attach(this._chart, this._series, this._container);
    this._installPreviewCanvas();
    this._container.addEventListener('mousedown', this._handleEditMouseDown, true);
    document.addEventListener('mousemove', this._handleEditMouseMove, true);
    document.addEventListener('mouseup', this._handleEditMouseUp, true);

    // Subscribe to library events
    const onLibChange = () => {
      if (this._suppressLibEvents) return;
      this._syncCacheFromLibrary();
      this._notifyChange();
    };
    const unsubAdded = this._libManager.on('drawing:added', onLibChange);
    const unsubRemoved = this._libManager.on('drawing:removed', onLibChange);
    const unsubUpdated = this._libManager.on('drawing:updated', onLibChange);
    const unsubCleared = this._libManager.on('drawing:cleared', onLibChange);
    const unsubSelected = this._libManager.on('drawing:selected', (event) => this._notifySelectionChange(event.drawingId ?? null));
    const unsubDeselected = this._libManager.on('drawing:deselected', () => this._notifySelectionChange(null));
    this._unsubLib = [unsubAdded, unsubRemoved, unsubUpdated, unsubCleared, unsubSelected, unsubDeselected];

    this._isAttached = true;
  }

  detach(): void {
    this.cancelPlacement();
    this._clearPreview();
    if (this._container) {
      this._container.removeEventListener('mousedown', this._handleEditMouseDown, true);
    }
    document.removeEventListener('mousemove', this._handleEditMouseMove, true);
    document.removeEventListener('mouseup', this._handleEditMouseUp, true);
    for (const unsub of this._unsubLib) unsub();
    this._unsubLib = [];
    this._previewCanvas?.remove();
    this._previewCanvas = null;
    this._activeDrag = null;
    if (this._libManager) {
      this._libManager.detach();
      this._libManager = null;
    }
    this._chart = null;
    this._series = null;
    this._container = null;
    this._drawingCache = [];
    this._isAttached = false;
  }

  // ── Import / Export ──────────────────────────────────────────────────

  importDrawings(drawings: readonly Drawing[]): void {
    if (!this._libManager) return;
    this._drawingCache = cloneDrawings(drawings);
    this._suppressLibEvents = true;
    this._libManager.clearAll();

    const registry = getToolRegistry();
    for (const drawing of this._drawingCache) {
      const ser = ourDrawingToLibrary(drawing);
      if (!ser) continue;

      const libDrawing = registry.createDrawing(
        ser.type,
        ser.id,
        ser.anchors,
        ser.style,
        ser.options,
      );
      if (libDrawing) {
        this._libManager.addDrawing(libDrawing);
      }
    }
    this._suppressLibEvents = false;
    this._applyIntervalVisibility();
    this._clearPreview();
  }

  exportDrawings(): Drawing[] {
    return cloneDrawings(this._drawingCache);
  }

  // ── Tool placement ───────────────────────────────────────────────────

  startTool(libraryToolType: string): void {
    if (!this._libManager || !this._chart || !this._series || !this._container) return;

    // Cancel any current placement
    this.cancelPlacement();

    const registry = getToolRegistry();
    const toolDef = registry.get(libraryToolType);
    if (!toolDef) {
      console.warn(`[LwcDrawingManager] Unknown tool: ${libraryToolType}`);
      return;
    }

    const isMultiPoint = MULTI_POINT_TOOLS.has(libraryToolType);
    this._activeTool = libraryToolType;
    this._requiredAnchors = isMultiPoint ? MULTI_POINT_MAX_ANCHORS : toolDef.requiredAnchors;
    this._libManager.setActiveTool(libraryToolType);

    // Create an InteractionHandler for this tool. Multi-point tools use a high
    // anchor cap so the FSM never auto-completes; we finish them explicitly.
    const config: InteractionConfig = {
      requiredAnchors: this._requiredAnchors,
      pixelToChart: (point) => {
        if (!this._chart || !this._series) return null;
        const time = this._chart.timeScale().coordinateToTime(point.x);
        const price = this._series.coordinateToPrice(point.y) as number | null;
        if (time === null || price === null || !Number.isFinite(price)) return null;
        return { time, price };
      },
      onComplete: () => {
        this._finishPlacement();
      },
      onCancel: () => {
        this.cancelPlacement();
      },
    };

    this._interaction = new InteractionHandler(config);

    // Wire DOM events for placement
    this._container.addEventListener('mousedown', this._handlePlacementMouseDown);
    this._container.addEventListener('mousemove', this._handlePlacementMouseMove);
    this._container.addEventListener('mouseup', this._handlePlacementMouseUp);
    // Capture-phase double-click so multi-point tools can finish before the
    // chart consumes the event (which would otherwise reset the time scale).
    this._container.addEventListener('dblclick', this._handlePlacementDoubleClick, true);
    document.addEventListener('keydown', this._handlePlacementKeyDown);

    // Set cursor to crosshair
    this._container.style.cursor = 'crosshair';
  }

  cancelPlacement(): void {
    if (!this._container) return;

    this._activeTool = null;
    this._interaction = null;
    this._requiredAnchors = 0;
    if (this._libManager) {
      this._libManager.setActiveTool(null);
    }

    // Remove DOM event listeners
    this._container.removeEventListener('mousedown', this._handlePlacementMouseDown);
    this._container.removeEventListener('mousemove', this._handlePlacementMouseMove);
    this._container.removeEventListener('mouseup', this._handlePlacementMouseUp);
    this._container.removeEventListener('dblclick', this._handlePlacementDoubleClick, true);
    document.removeEventListener('keydown', this._handlePlacementKeyDown);

    // Restore cursor
    this._container.style.cursor = '';
    this._lastPreviewPoint = null;
    this._clearPreview();
  }

  isPlacing(): boolean {
    return this._interaction !== null && this._activeTool !== null;
  }

  getActiveTool(): string | null {
    return this._activeTool;
  }

  // ── Selection ────────────────────────────────────────────────────────

  select(id: string | null): void {
    if (!this._libManager) return;
    if (id === null) {
      this._libManager.deselectAll();
      this._notifySelectionChange(null);
    } else {
      this._libManager.selectDrawing(id);
      this._notifySelectionChange(id);
    }
  }

  getSelectedId(): string | null {
    return this._libManager?.getSelectedDrawing()?.id ?? null;
  }

  // ── Mutation ─────────────────────────────────────────────────────────

  remove(id: string): void {
    this._drawingCache = this._drawingCache.filter((drawing) => drawing.id !== id);
    this._libManager?.removeDrawing(id);
  }

  clear(): void {
    this._drawingCache = [];
    this._libManager?.clearAll();
  }

  setLocked(id: string, locked: boolean): void {
    const d = this._libManager?.getDrawing(id);
    if (d) {
      d.updateOptions({ locked });
      this._patchCachedDrawing(id, (drawing) => ({ ...drawing, lock: locked, updatedAt: Date.now() }));
      this._notifyChange();
    }
  }

  setVisible(id: string, visible: boolean): void {
    const d = this._libManager?.getDrawing(id);
    if (d) {
      d.updateOptions({ visible });
      this._patchCachedDrawing(id, (drawing) => ({ ...drawing, visible, updatedAt: Date.now() }));
      this._notifyChange();
    }
  }

  setMagnetMode(mode: 'off' | 'weak' | 'strong'): void {
    this._magnetMode = mode;
  }

  setStayInDrawingMode(enabled: boolean): void {
    this._stayInDrawingMode = enabled;
  }

  moveSelection(): void {
    const selected = this.getSelectedId();
    if (!selected) return;
    const drawing = this._drawingCache.find((item) => item.id === selected);
    if (drawing) this._replaceCachedDrawing(drawing);
  }

  updateAnchor(id?: string, index?: number, anchor?: { readonly time: unknown; readonly price: number }): void {
    if (id === undefined || index === undefined || anchor === undefined) return;
    const time = typeof anchor.time === 'number' ? anchor.time : Number(anchor.time);
    if (!Number.isFinite(time) || !Number.isFinite(anchor.price)) return;
    this._patchCachedDrawing(id, (drawing) => {
      const points = drawing.points.map((point) => ({ ...point }));
      points[index] = { timestamp: Math.round(time * 1000), value: anchor.price };
      return { ...drawing, points, updatedAt: Date.now() };
    });
    this._syncLibraryDrawing(id);
    this._notifyChange();
  }

  setToolDefaultStyle(style: Record<string, unknown>): void {
    this._defaultStyle = {
      ...this._defaultStyle,
      ...Object.fromEntries(
        Object.entries(style).filter(([, value]) => typeof value === 'string' || typeof value === 'number'),
      ),
    } as DefaultDrawingStyle;
  }

  setIntervalContext(interval: string | null): void {
    this._currentInterval = interval;
    this._applyIntervalVisibility();
  }

  setVisibilityOnIntervals(id: string, intervals: readonly string[]): void {
    const drawing = this._drawingCache.find((item) => item.id === id);
    if (!drawing) return;
    const extendData =
      drawing.extendData && typeof drawing.extendData === 'object' && !Array.isArray(drawing.extendData)
        ? { ...(drawing.extendData as Record<string, unknown>) }
        : {};
    extendData.visibility = { intervals: [...intervals] };
    this._patchCachedDrawing(id, (item) => ({ ...item, extendData, updatedAt: Date.now() }));
    this._syncLibraryDrawing(id);
    this.select(id);
    this._notifyChange();
  }

  // ── Events ───────────────────────────────────────────────────────────

  onChange(callback: (drawings: Drawing[]) => void): () => void {
    this._changeCallbacks.push(callback);
    return () => {
      this._changeCallbacks = this._changeCallbacks.filter((cb) => cb !== callback);
    };
  }

  onSelectionChange(callback: (id: string | null) => void): () => void {
    this._selectionCallbacks.push(callback);
    return () => {
      this._selectionCallbacks = this._selectionCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _notifyChange(): void {
    const exportData = this.exportDrawings();
    for (const cb of this._changeCallbacks) {
      cb(exportData);
    }
  }

  private _notifySelectionChange(id: string | null): void {
    for (const cb of this._selectionCallbacks) cb(id);
  }

  private _syncCacheFromLibrary(): void {
    if (!this._libManager) return;
    const exported = this._libManager.exportDrawings().map(libraryToOurDrawing);
    const previous = new Map(this._drawingCache.map((drawing) => [drawing.id, drawing]));
    this._drawingCache = exported.map((drawing) => {
      const old = previous.get(drawing.id);
      // `visible`/`lock`/`extendData` are stored truth: they only change via
      // explicit edits (setVisible/setLocked/commit), never via dragging. The
      // library copy may carry interval-render visibility, so keep ours.
      return old
        ? {
            ...drawing,
            groupId: old.groupId,
            extendData: old.extendData,
            visible: old.visible,
            lock: old.lock,
            createdAt: old.createdAt,
            updatedAt: Date.now(),
          }
        : drawing;
    });
  }

  /** Re-apply render visibility to library drawings from stored visible + interval config. */
  private _applyIntervalVisibility(): void {
    if (!this._libManager) return;
    for (const drawing of this._drawingCache) {
      const libDrawing = this._libManager.getDrawing(drawing.id);
      if (!libDrawing) continue;
      const renderVisible = drawing.visible !== false && drawingAllowedOnInterval(drawing, this._currentInterval);
      libDrawing.updateOptions({ visible: renderVisible });
    }
  }

  private _patchCachedDrawing(id: string, patch: (drawing: Drawing) => Drawing): void {
    this._drawingCache = this._drawingCache.map((drawing) => drawing.id === id ? patch(drawing) : drawing);
  }

  private _replaceCachedDrawing(next: Drawing): void {
    this._drawingCache = this._drawingCache.map((drawing) => drawing.id === next.id ? cloneDrawing(next) : drawing);
    this._syncLibraryDrawing(next.id);
  }

  private _syncLibraryDrawing(id: string): void {
    if (!this._libManager) return;
    const drawing = this._drawingCache.find((item) => item.id === id);
    const libDrawing = this._libManager.getDrawing(id);
    const ser = drawing ? ourDrawingToLibrary(drawing) : null;
    if (!drawing || !libDrawing || !ser) return;
    libDrawing.setAnchors(ser.anchors);
    libDrawing.updateOptions(ser.options);
  }

  private _installPreviewCanvas(): void {
    if (!this._container || this._previewCanvas) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'lwc-drawing-preview-canvas';
    canvas.dataset.testid = 'drawing-preview-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9';
    this._container.appendChild(canvas);
    this._previewCanvas = canvas;
    this._resizePreviewCanvas();
  }

  private _resizePreviewCanvas(): void {
    if (!this._previewCanvas || !this._container) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this._container.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this._container.clientHeight * ratio));
    if (this._previewCanvas.width !== width) this._previewCanvas.width = width;
    if (this._previewCanvas.height !== height) this._previewCanvas.height = height;
  }

  private _clearPreview(): void {
    const ctx = this._previewCanvas?.getContext('2d');
    if (!ctx || !this._previewCanvas) return;
    ctx.clearRect(0, 0, this._previewCanvas.width, this._previewCanvas.height);
  }

  private _pointFromEvent(e: MouseEvent): PixelPoint | null {
    if (!this._container) return null;
    const rect = this._container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _anchorFromPixel(point: PixelPoint): Anchor | null {
    if (!this._chart || !this._series) return null;
    const time = this._chart.timeScale().coordinateToTime(point.x);
    const price = this._series.coordinateToPrice(point.y) as number | null;
    if (time === null || price === null || !Number.isFinite(price)) return null;
    return { time, price };
  }

  private _drawingPointToPixel(point: Drawing['points'][number]): PixelPoint | null {
    if (!this._chart || !this._series) return null;
    if (typeof point.timestamp !== 'number' || typeof point.value !== 'number') return null;
    const x = this._chart.timeScale().timeToCoordinate((point.timestamp / 1000) as Time);
    const y = this._series.priceToCoordinate(point.value);
    if (x === null || y === null) return null;
    return { x, y };
  }

  private _anchorToPixel(anchor: Anchor): PixelPoint | null {
    if (!this._chart || !this._series) return null;
    const x = this._chart.timeScale().timeToCoordinate(anchor.time);
    const y = this._series.priceToCoordinate(anchor.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  private _pixelsForDrawing(drawing: Drawing): PixelPoint[] {
    return drawing.points
      .map((point) => this._drawingPointToPixel(point))
      .filter((point): point is PixelPoint => point !== null);
  }

  private _hitAnchor(point: PixelPoint): { readonly drawing: Drawing; readonly index: number } | null {
    const selectedId = this.getSelectedId();
    const candidates = selectedId
      ? this._drawingCache.filter((drawing) => drawing.id === selectedId)
      : [...this._drawingCache].reverse();
    for (const drawing of candidates) {
      if (drawing.visible === false) continue;
      const pixels = this._pixelsForDrawing(drawing);
      for (let index = 0; index < pixels.length; index++) {
        const handle = pixels[index];
        if (handle && pointDistance(point, handle) <= HANDLE_RADIUS + 2) return { drawing, index };
      }
    }
    return null;
  }

  private _hitBody(point: PixelPoint): Drawing | null {
    const ordered = [...this._drawingCache].sort((a, b) => (b.zLevel ?? 0) - (a.zLevel ?? 0));
    for (const drawing of ordered) {
      if (drawing.visible === false) continue;
      const pixels = this._pixelsForDrawing(drawing);
      if (pixels.length === 0) continue;
      if (CHANNEL_TOOLS.has(drawing.name) && pixels.length >= 4) {
        if (
          distanceToSegment(point, pixels[0]!, pixels[1]!) <= HIT_THRESHOLD ||
          distanceToSegment(point, pixels[2]!, pixels[3]!) <= HIT_THRESHOLD ||
          isInsidePolygonBounds(point, [pixels[0]!, pixels[1]!, pixels[3]!, pixels[2]!])
        ) return drawing;
        continue;
      }
      if (BOUNDED_TOOLS.has(drawing.name) && pixels.length >= 2) {
        if (isInsidePolygonBounds(point, [pixels[0]!, pixels[1]!])) return drawing;
        continue;
      }
      for (let index = 0; index < pixels.length - 1; index++) {
        if (distanceToSegment(point, pixels[index]!, pixels[index + 1]!) <= HIT_THRESHOLD) return drawing;
      }
      if (pixels.some((pixel) => pointDistance(point, pixel) <= HIT_THRESHOLD + 4)) return drawing;
    }
    return null;
  }

  private _drawPreview(): void {
    this._resizePreviewCanvas();
    this._clearPreview();
    const ctx = this._previewCanvas?.getContext('2d');
    if (!ctx || !this._previewCanvas || !this._interaction || !this._activeTool) return;
    const ratio = window.devicePixelRatio || 1;
    const anchors = this._interaction.getAnchors();
    const preview = this._interaction.getPreviewAnchor() ?? (this._lastPreviewPoint ? this._anchorFromPixel(this._lastPreviewPoint) : null);
    const points = [...anchors, ...(preview ? [preview] : [])]
      .map((anchor) => this._anchorToPixel(anchor))
      .filter((point): point is PixelPoint => point !== null);

    ctx.save();
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = this._defaultStyle.lineColor;
    ctx.fillStyle = this._defaultStyle.fillColor;
    ctx.lineWidth = this._defaultStyle.lineWidth;
    ctx.setLineDash([6, 5]);

    if (points.length === 0 && this._lastPreviewPoint) {
      const p = this._lastPreviewPoint;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y);
      ctx.lineTo(p.x + 8, p.y);
      ctx.moveTo(p.x, p.y - 8);
      ctx.lineTo(p.x, p.y + 8);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if ((this._activeTool === 'rectangle' || this._activeTool === 'price-range' || this._activeTool === 'date-price-range') && points.length >= 2) {
      const a = points[0]!;
      const b = points[1]!;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (this._activeTool === 'parallel-channel' && points.length >= 2) {
      const a = points[0]!;
      const b = points[1]!;
      const c = points[2] ?? points[1]!;
      const d = { x: b.x + (c.x - a.x), y: b.y + (c.y - a.y) };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    } else if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (points.length === 1) {
      const p = points[0]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private _moveDrawingByPixels(original: Drawing, start: PixelPoint, current: PixelPoint): Drawing | null {
    const startAnchor = this._anchorFromPixel(start);
    const currentAnchor = this._anchorFromPixel(current);
    if (!startAnchor || !currentAnchor) return null;
    const startTime = Number(startAnchor.time);
    const currentTime = Number(currentAnchor.time);
    if (!Number.isFinite(startTime) || !Number.isFinite(currentTime)) return null;
    const dtMs = Math.round((currentTime - startTime) * 1000);
    const dp = currentAnchor.price - startAnchor.price;
    return {
      ...original,
      points: original.points.map((point) => ({
        ...point,
        timestamp: typeof point.timestamp === 'number' ? point.timestamp + dtMs : point.timestamp,
        value: typeof point.value === 'number' ? point.value + dp : point.value,
      })),
      updatedAt: Date.now(),
    };
  }

  private _updateAnchorByPixels(original: Drawing, index: number, current: PixelPoint): Drawing | null {
    const anchor = this._anchorFromPixel(current);
    if (!anchor) return null;
    const nextPoint = anchorToOurPoint(anchor);
    if (nextPoint.timestamp === undefined || nextPoint.value === undefined) return null;
    const points = original.points.map((point) => ({ ...point }));
    if (CHANNEL_TOOLS.has(original.name) && points.length >= 4) {
      const pixels = this._pixelsForDrawing(original);
      const p0 = pixels[0];
      const p1 = pixels[1];
      const p2 = pixels[2];
      const p3 = pixels[3];
      if (p0 && p1 && p2 && p3) {
        if (index === 0) {
          const offset = { x: p2.x - p0.x, y: p2.y - p0.y };
          points[0] = nextPoint;
          const movedPair = this._anchorFromPixel({ x: current.x + offset.x, y: current.y + offset.y });
          if (movedPair) points[2] = anchorToOurPoint(movedPair);
        } else if (index === 1) {
          const offset = { x: p3.x - p1.x, y: p3.y - p1.y };
          points[1] = nextPoint;
          const movedPair = this._anchorFromPixel({ x: current.x + offset.x, y: current.y + offset.y });
          if (movedPair) points[3] = anchorToOurPoint(movedPair);
        } else if (index === 2) {
          const offset = { x: current.x - p0.x, y: current.y - p0.y };
          points[2] = nextPoint;
          const movedPair = this._anchorFromPixel({ x: p1.x + offset.x, y: p1.y + offset.y });
          if (movedPair) points[3] = anchorToOurPoint(movedPair);
        } else if (index === 3) {
          const offset = { x: current.x - p1.x, y: current.y - p1.y };
          points[3] = nextPoint;
          const movedPair = this._anchorFromPixel({ x: p0.x + offset.x, y: p0.y + offset.y });
          if (movedPair) points[2] = anchorToOurPoint(movedPair);
        }
      }
    } else {
      points[index] = nextPoint;
    }
    return { ...original, points, updatedAt: Date.now() };
  }

  private _applyInteractiveDrawing(next: Drawing): void {
    this._drawingCache = this._drawingCache.map((drawing) => drawing.id === next.id ? cloneDrawing(next) : drawing);
    this._syncLibraryDrawing(next.id);
  }

  private _expandPlacedDrawing(drawing: Drawing): Drawing {
    if (!CHANNEL_TOOLS.has(drawing.name) || drawing.points.length !== 3) return drawing;
    const anchors: Anchor[] = drawing.points
      .map((point) => {
        if (typeof point.timestamp !== 'number' || typeof point.value !== 'number') return null;
        return { time: (point.timestamp / 1000) as Time, price: point.value };
      })
      .filter((anchor): anchor is Anchor => anchor !== null);
    return {
      ...drawing,
      points: expandedChannelPoints(anchors).map(anchorToOurPoint),
    };
  }

  private _isMultiPointTool(): boolean {
    return this._activeTool !== null && MULTI_POINT_TOOLS.has(this._activeTool);
  }

  /** Trim trailing anchors that collapse onto the previous one (double-click tail). */
  private _dedupeTrailingAnchors(anchors: readonly Anchor[]): Anchor[] {
    const result = [...anchors];
    while (result.length > 2) {
      const last = this._anchorToPixel(result[result.length - 1]!);
      const prev = this._anchorToPixel(result[result.length - 2]!);
      if (last && prev && pointDistance(last, prev) < MULTI_POINT_DEDUPE_PX) {
        result.pop();
      } else {
        break;
      }
    }
    return result;
  }

  /** Shared commit path: create the library drawing, cache it, and select it. */
  private _commitPlacement(toolType: string, anchors: readonly Anchor[]): void {
    if (!this._libManager) return;
    const manager = this._libManager;
    const registry = getToolRegistry();
    const id = freshId();
    const stayInDrawingMode = this._stayInDrawingMode;

    this.cancelPlacement();

    const libDrawing = registry.createDrawing(toolType, id, [...anchors], this._defaultStyle, {
      visible: true,
      locked: false,
      zIndex: 0,
      extendLeft: toolType === 'extended-line' || toolType === 'ray',
      extendRight: toolType === 'extended-line' || toolType === 'ray',
    });

    if (libDrawing) {
      const persisted = this._expandPlacedDrawing(libraryToOurDrawing(libDrawing.toJSON()));
      this._drawingCache = [...this._drawingCache, persisted];
      this._suppressLibEvents = true;
      try {
        manager.addDrawing(libDrawing);
      } finally {
        this._suppressLibEvents = false;
      }
      manager.selectDrawing(id);
      this._notifySelectionChange(id);
      this._notifyChange();
    }
    if (stayInDrawingMode) {
      this.startTool(toolType);
    }
  }

  private _finishPlacement(): void {
    if (!this._interaction || !this._activeTool || !this._libManager) return;

    const rawAnchors = this._interaction.getAnchors();
    const toolType = this._activeTool;
    if (rawAnchors.length === 0) {
      this.cancelPlacement();
      return;
    }

    const anchors = toolType === 'parallel-channel' ? expandedChannelPoints(rawAnchors) : rawAnchors;
    this._commitPlacement(toolType, anchors);
  }

  /** Finish an open-ended multi-point tool (path/polyline/brush/highlighter). */
  private _finishMultiPoint(): void {
    if (!this._interaction || !this._activeTool || !this._libManager) return;
    const toolType = this._activeTool;
    const anchors = this._dedupeTrailingAnchors(this._interaction.getAnchors());
    if (anchors.length < 2) {
      this.cancelPlacement();
      return;
    }
    this._commitPlacement(toolType, anchors);
  }

  private _finishPlacementIfReady(): void {
    if (!this._interaction || this._isMultiPointTool()) return;
    if (
      this._interaction.isComplete() ||
      (this._requiredAnchors > 0 && this._interaction.getAnchors().length >= this._requiredAnchors)
    ) {
      this._finishPlacement();
    }
  }

  // ── DOM event handlers for placement ─────────────────────────────────
  // These are arrow functions so `this` is captured.

  private _handlePlacementMouseDown = (e: MouseEvent): void => {
    if (!this._interaction || !this._container) return;
    const rect = this._container.getBoundingClientRect();
    const data: MouseEventData = {
      point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      time: null,
      price: null,
      srcEvent: e,
    };
    this._lastPreviewPoint = data.point;
    this._interaction.onMouseDown(data);
    this._drawPreview();
    this._finishPlacementIfReady();
  };

  private _handlePlacementMouseMove = (e: MouseEvent): void => {
    // Only handle move during placement — the library's DrawingManager
    // handles anchor dragging for selected drawings.
    if (!this._interaction || !this._container) return;
    const rect = this._container.getBoundingClientRect();
    const data: MouseEventData = {
      point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      time: null,
      price: null,
      srcEvent: e,
    };
    this._lastPreviewPoint = data.point;
    this._interaction.onMouseMove(data);
    this._drawPreview();

    // If placement completed (single-click tools like horizontal line),
    // the onComplete callback fires synchronously and resets.
  };

  private _handlePlacementMouseUp = (e: MouseEvent): void => {
    if (!this._interaction || !this._container) return;
    const rect = this._container.getBoundingClientRect();
    this._interaction.onMouseUp({
      point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      time: null,
      price: null,
      srcEvent: e,
    });

    this._finishPlacementIfReady();
  };

  private _handlePlacementDoubleClick = (e: MouseEvent): void => {
    if (!this._interaction || !this._isMultiPointTool()) return;
    e.preventDefault();
    e.stopPropagation();
    this._finishMultiPoint();
  };

  private _handlePlacementKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._interaction) {
        this._interaction.onKeyDown('Escape');
      }
      this.cancelPlacement();
      return;
    }
    if (e.key === 'Enter' && this._isMultiPointTool()) {
      e.preventDefault();
      this._finishMultiPoint();
    }
  };

  private _handleEditMouseDown = (e: MouseEvent): void => {
    if (this._interaction || e.button !== 0) return;
    const point = this._pointFromEvent(e);
    if (!point || !this._libManager) return;
    const anchorHit = this._hitAnchor(point);
    const bodyHit = anchorHit ? anchorHit.drawing : this._hitBody(point);
    if (!bodyHit) return;

    this.select(bodyHit.id);
    this._notifySelectionChange(bodyHit.id);
    e.preventDefault();
    e.stopImmediatePropagation();

    if (bodyHit.lock) return;
    this._activeDrag = {
      kind: anchorHit ? 'anchor' : 'body',
      drawingId: bodyHit.id,
      anchorIndex: anchorHit?.index ?? null,
      startPoint: point,
      original: cloneDrawing(bodyHit),
      moved: false,
    };
    this._container!.style.cursor = anchorHit ? 'grabbing' : 'move';
  };

  private _handleEditMouseMove = (e: MouseEvent): void => {
    const drag = this._activeDrag;
    if (!drag) return;
    const point = this._pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drag.moved = drag.moved || pointDistance(point, drag.startPoint) > 2;
    const next =
      drag.kind === 'body'
        ? this._moveDrawingByPixels(drag.original, drag.startPoint, point)
        : drag.anchorIndex === null
          ? null
          : this._updateAnchorByPixels(drag.original, drag.anchorIndex, point);
    if (next) this._applyInteractiveDrawing(next);
  };

  private _handleEditMouseUp = (e: MouseEvent): void => {
    const drag = this._activeDrag;
    if (!drag) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this._activeDrag = null;
    if (this._container) this._container.style.cursor = this._activeTool ? 'crosshair' : '';
    this.select(drag.drawingId);
    this._notifySelectionChange(drag.drawingId);
    if (drag.moved) this._notifyChange();
  };
}
