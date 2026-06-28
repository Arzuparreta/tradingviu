import {
  DrawingManager as LibDrawingManager,
  InteractionHandler,
  getToolRegistry,
  type MouseEventData,
  type InteractionConfig,
} from 'lightweight-charts-drawing';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Drawing } from '@tv/core';
import type { DrawingManager as IDrawingManager, ChartSurfaceHandle } from './types';
import { ourDrawingToLibrary, libraryToOurDrawing } from './convert';

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

  // Subscriptions
  private _changeCallbacks: Array<(drawings: Drawing[]) => void> = [];
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

    // Subscribe to library events
    const unsubAdded = this._libManager.on('drawing:added', () => this._notifyChange());
    const unsubRemoved = this._libManager.on('drawing:removed', () => this._notifyChange());
    const unsubUpdated = this._libManager.on('drawing:updated', () => this._notifyChange());
    const unsubCleared = this._libManager.on('drawing:cleared', () => this._notifyChange());
    this._unsubLib = [unsubAdded, unsubRemoved, unsubUpdated, unsubCleared];

    this._isAttached = true;
  }

  detach(): void {
    this.cancelPlacement();
    for (const unsub of this._unsubLib) unsub();
    this._unsubLib = [];
    if (this._libManager) {
      this._libManager.detach();
      this._libManager = null;
    }
    this._chart = null;
    this._series = null;
    this._container = null;
    this._isAttached = false;
  }

  // ── Import / Export ──────────────────────────────────────────────────

  importDrawings(drawings: readonly Drawing[]): void {
    if (!this._libManager) return;
    this._libManager.clearAll();

    const registry = getToolRegistry();
    for (const drawing of drawings) {
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
  }

  exportDrawings(): Drawing[] {
    if (!this._libManager) return [];
    const serialized = this._libManager.exportDrawings();
    return serialized.map(libraryToOurDrawing);
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

    this._activeTool = libraryToolType;
    this._requiredAnchors = toolDef.requiredAnchors;
    this._libManager.setActiveTool(libraryToolType);

    // Create an InteractionHandler for this tool
    const config: InteractionConfig = {
      requiredAnchors: toolDef.requiredAnchors,
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
    document.removeEventListener('keydown', this._handlePlacementKeyDown);

    // Restore cursor
    this._container.style.cursor = '';
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
    } else {
      this._libManager.selectDrawing(id);
    }
  }

  getSelectedId(): string | null {
    return this._libManager?.getSelectedDrawing()?.id ?? null;
  }

  // ── Mutation ─────────────────────────────────────────────────────────

  remove(id: string): void {
    this._libManager?.removeDrawing(id);
  }

  clear(): void {
    this._libManager?.clearAll();
  }

  setLocked(id: string, locked: boolean): void {
    const d = this._libManager?.getDrawing(id);
    if (d) {
      d.updateOptions({ locked });
      this._notifyChange();
    }
  }

  setVisible(id: string, visible: boolean): void {
    const d = this._libManager?.getDrawing(id);
    if (d) {
      d.updateOptions({ visible });
      this._notifyChange();
    }
  }

  // ── Events ───────────────────────────────────────────────────────────

  onChange(callback: (drawings: Drawing[]) => void): () => void {
    this._changeCallbacks.push(callback);
    return () => {
      this._changeCallbacks = this._changeCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _notifyChange(): void {
    const exportData = this.exportDrawings();
    for (const cb of this._changeCallbacks) {
      cb(exportData);
    }
  }

  private _finishPlacement(): void {
    if (!this._interaction || !this._activeTool || !this._libManager) return;

    const anchors = this._interaction.getAnchors();
    const toolType = this._activeTool;
    const manager = this._libManager;
    if (anchors.length === 0) {
      this.cancelPlacement();
      return;
    }

    const registry = getToolRegistry();
    const id = freshId();

    this.cancelPlacement();

    const libDrawing = registry.createDrawing(toolType, id, anchors, DEFAULT_STYLE, {
      visible: true,
      locked: false,
      zIndex: 0,
      extendLeft: toolType === 'extended-line' || toolType === 'ray',
      extendRight: toolType === 'extended-line' || toolType === 'ray',
    });

    if (libDrawing) {
      manager.addDrawing(libDrawing);
      manager.selectDrawing(id);
    }
  }

  private _finishPlacementIfReady(): void {
    if (!this._interaction) return;
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
    this._interaction.onMouseDown(data);
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
    this._interaction.onMouseMove(data);

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

  private _handlePlacementKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._interaction) {
        this._interaction.onKeyDown('Escape');
      }
      this.cancelPlacement();
    }
  };
}
