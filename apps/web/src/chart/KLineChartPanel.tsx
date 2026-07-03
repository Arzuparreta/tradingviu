import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Circle,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  Redo2,
  type LucideIcon,
} from 'lucide-react';
import {
  ActionType,
  type Chart,
  type KLineData,
  type Overlay,
  type OverlayCreate,
  type OverlayEvent,
} from 'klinecharts';
import type { Panel } from '@tv/layout-sync';
import type { Drawing } from '@tv/drawing-tools';
import { api } from '../api/client';
import type { Symbol as TvSymbol } from '../api/types';
import { KLineChartSurface, type KLineChartSurfaceHandle } from './KLineChartSurface';

export interface PanelBounds {
  min: number;
  max: number;
  step: number;
}

export interface ChartPanelProps {
  panel: Panel;
  symbol: TvSymbol | null;
  active: boolean;
  live: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<Panel>) => void;
  replayActive?: boolean;
  replayCursor?: number | null;
  onBounds?: (id: string, bounds: PanelBounds | null) => void;
}

export interface KLineChartPanelHandle {
  exportDrawings(): Drawing[];
  importDrawings(drawings: Drawing[]): void;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface DrawingTool {
  name: string;
  label: string;
  icon: LucideIcon;
}

interface DrawingDebugState {
  panelId: string;
  active: boolean;
  overlayCount: number;
  selectedId: string | null;
  hoveredId: string | null;
  activeTool: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

declare global {
  interface Window {
    __TV_E2E_DRAWINGS__?: Record<string, DrawingDebugState>;
  }
}

const DRAWING_TOOLS: readonly DrawingTool[] = [
  { name: 'segment', label: 'Trend line', icon: TrendingUp },
  { name: 'rayLine', label: 'Ray', icon: MoveHorizontal },
  { name: 'horizontalStraightLine', label: 'Horizontal line', icon: Minus },
  { name: 'verticalStraightLine', label: 'Vertical line', icon: Crosshair },
  { name: 'rect', label: 'Rectangle', icon: Square },
  { name: 'circle', label: 'Circle', icon: Circle },
  { name: 'fibonacciLine', label: 'Fibonacci', icon: TrendingUp },
  { name: 'text', label: 'Text', icon: Type },
  { name: 'priceLine', label: 'Price line', icon: Minus },
];

const OVERLAY_NAMES = new Set([
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
  'crossLine',
  'infoLine',
  'trendAngle',
  'arrow',
  'rect',
  'circle',
  'triangle',
  'ellipse',
  'arc',
  'rotatedRectangle',
  'path',
  'polyline',
  'curve',
  'doubleCurve',
  'text',
  'callout',
  'anchoredText',
  'note',
  'priceNote',
  'priceLabel',
  'flag',
  'pin',
  'comment',
  'signpost',
  'fibonacciLine',
  'fibExtension',
  'fibChannel',
  'fibTimeZone',
  'fibSpeedFan',
  'fibTimeExtension',
  'fibCircles',
  'fibSpiral',
  'fibArcs',
  'fibWedge',
  'pitchfan',
  'parallelStraightLine',
  'priceChannelLine',
  'regressionTrend',
  'flatTopBottom',
  'disjointChannel',
  'priceLine',
  'priceRange',
  'dateRange',
  'datePriceRange',
  'projection',
  'forecast',
  'barsPattern',
  'longPosition',
  'shortPosition',
  'andrewsPitchfork',
  'schiffPitchfork',
  'modifiedSchiffPitchfork',
  'insidePitchfork',
  'gannBox',
  'gannFan',
  'gannSquareFixed',
  'gannSquare',
  'brush',
  'highlighter',
  'arrowMarker',
]);

function isDrawingOverlay(ov: Overlay): boolean {
  return OVERLAY_NAMES.has(ov.name);
}

function cloneDrawing(drawing: Drawing): Drawing {
  return {
    ...drawing,
    points: drawing.points.map((point) => ({ ...point })),
    styles:
      drawing.styles == null
        ? drawing.styles
        : (JSON.parse(JSON.stringify(drawing.styles)) as Drawing['styles']),
    extendData:
      drawing.extendData === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(drawing.extendData)) as Drawing['extendData']),
  };
}

function cloneDrawings(drawings: readonly Drawing[]): Drawing[] {
  return drawings.map(cloneDrawing);
}

function overlayToDrawing(ov: Overlay): Drawing {
  return {
    engine: 'klinecharts' as const,
    id: ov.id,
    name: ov.name,
    groupId: ov.groupId || undefined,
    points: ov.points.map((p) => ({
      timestamp: p.timestamp,
      dataIndex: p.dataIndex,
      value: p.value,
    })),
    styles: ov.styles ?? {},
    mode: ov.mode as Drawing['mode'],
    lock: ov.lock,
    visible: ov.visible,
    zLevel: ov.zLevel,
    extendData: ov.extendData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function boundsFromData(data: readonly KLineData[]): PanelBounds | null {
  if (data.length === 0) return null;

  let step = Infinity;
  for (let i = 1; i < data.length; i++) {
    const d = (data[i]!.timestamp - data[i - 1]!.timestamp) / 1000;
    if (d > 0 && d < step) step = d;
  }

  return {
    min: Math.floor(data[0]!.timestamp / 1000),
    max: Math.floor(data[data.length - 1]!.timestamp / 1000),
    step: Number.isFinite(step) && step > 0 ? step : 60,
  };
}

export const KLineChartPanel = forwardRef<KLineChartPanelHandle, ChartPanelProps>(
  function KLineChartPanel(
    {
      panel,
      symbol,
      active,
      live,
      onActivate,
      replayActive = false,
      replayCursor = null,
      onBounds,
    },
    ref,
  ) {
    const chartHandleRef = useRef<KLineChartSurfaceHandle>(null);
    const chartApiRef = useRef<Chart | null>(null);
    const fullDataRef = useRef<KLineData[]>([]);
    const overlayIdsRef = useRef<Set<string>>(new Set());
    const hadCursorRef = useRef(false);
    const loadKeyRef = useRef('');
    const drawingLoadSeqRef = useRef(0);
    const chartActionCleanupRef = useRef<(() => void)[]>([]);
    const suppressEventsRef = useRef(false);
    const persistTimerRef = useRef<number | null>(null);
    const undoStackRef = useRef<Drawing[][]>([]);
    const redoStackRef = useRef<Drawing[][]>([]);
    const selectedIdRef = useRef<string | null>(null);
    const hoveredIdRef = useRef<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [historyVersion, setHistoryVersion] = useState(0);
    const [toolbarPoint, setToolbarPoint] = useState<PixelPoint | null>(null);
    const [appliedDataKey, setAppliedDataKey] = useState('');

    const onBoundsRef = useRef(onBounds);
    onBoundsRef.current = onBounds;
    selectedIdRef.current = selectedId;
    hoveredIdRef.current = hoveredId;

    const exportCurrentDrawings = useCallback((): Drawing[] => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return [];
      const drawings: Drawing[] = [];
      for (const id of overlayIdsRef.current) {
        const ov = chartApi.getOverlayById(id);
        if (ov && isDrawingOverlay(ov)) drawings.push(overlayToDrawing(ov));
      }
      return drawings;
    }, []);

    const schedulePersist = useCallback(() => {
      if (!panel.symbolId) return;
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
      const symbolId = panel.symbolId;
      const interval = panel.interval;
      const scope = panel.drawingScopeId;
      const drawings = exportCurrentDrawings();
      persistTimerRef.current = window.setTimeout(() => {
        void api.saveDrawings(symbolId, interval, drawings, scope).catch(() => {
          return;
        });
      }, 350);
    }, [exportCurrentDrawings, panel.drawingScopeId, panel.interval, panel.symbolId]);

    useEffect(
      () => () => {
        if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
      },
      [],
    );

    const updateHistoryState = useCallback(() => {
      setHistoryVersion((version) => version + 1);
    }, []);

    const pushUndoSnapshot = useCallback(() => {
      undoStackRef.current = [
        ...undoStackRef.current.slice(-39),
        cloneDrawings(exportCurrentDrawings()),
      ];
      redoStackRef.current = [];
      updateHistoryState();
    }, [exportCurrentDrawings, updateHistoryState]);

    const overlayPosition = useCallback((id: string | null): PixelPoint | null => {
      const chartApi = chartApiRef.current;
      if (!chartApi || !id) return null;
      const overlay = chartApi.getOverlayById(id);
      if (!overlay || overlay.points.length === 0) return null;
      const raw = chartApi.convertToPixel(overlay.points, {
        paneId: overlay.paneId,
        absolute: true,
      });
      if (!Array.isArray(raw)) return null;
      const points = raw.filter(
        (point): point is PixelPoint => typeof point.x === 'number' && typeof point.y === 'number',
      );
      if (points.length === 0) return null;
      const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const y = Math.min(...points.map((point) => point.y));
      return { x, y };
    }, []);

    const updateToolbarPosition = useCallback(
      (id: string | null) => {
        setToolbarPoint(overlayPosition(id));
      },
      [overlayPosition],
    );

    const selectOverlay = useCallback(
      (id: string | null) => {
        setSelectedId(id);
        selectedIdRef.current = id;
        updateToolbarPosition(id);
      },
      [updateToolbarPosition],
    );

    const onOverlaySelected = useCallback(
      (event: OverlayEvent): boolean => {
        selectOverlay(event.overlay.id);
        return true;
      },
      [selectOverlay],
    );

    const onOverlayDeselected = useCallback(
      (event: OverlayEvent): boolean => {
        if (selectedIdRef.current === event.overlay.id) selectOverlay(null);
        return true;
      },
      [selectOverlay],
    );

    const onOverlayMouseEnter = useCallback((event: OverlayEvent): boolean => {
      setHoveredId(event.overlay.id);
      hoveredIdRef.current = event.overlay.id;
      return true;
    }, []);

    const onOverlayMouseLeave = useCallback((event: OverlayEvent): boolean => {
      if (hoveredIdRef.current === event.overlay.id) {
        setHoveredId(null);
        hoveredIdRef.current = null;
      }
      return true;
    }, []);

    const onOverlayDrawEnd = useCallback(
      (event: OverlayEvent): boolean => {
        if (suppressEventsRef.current) return true;
        overlayIdsRef.current.add(event.overlay.id);
        setActiveTool(null);
        selectOverlay(event.overlay.id);
        updateToolbarPosition(event.overlay.id);
        schedulePersist();
        return true;
      },
      [schedulePersist, selectOverlay, updateToolbarPosition],
    );

    const onOverlayPressedMoveStart = useCallback((): boolean => {
      if (!suppressEventsRef.current) pushUndoSnapshot();
      return true;
    }, [pushUndoSnapshot]);

    const onOverlayPressedMoveEnd = useCallback(
      (event: OverlayEvent): boolean => {
        if (suppressEventsRef.current) return true;
        selectOverlay(event.overlay.id);
        updateToolbarPosition(event.overlay.id);
        schedulePersist();
        return true;
      },
      [schedulePersist, selectOverlay, updateToolbarPosition],
    );

    const onOverlayRemoved = useCallback(
      (event: OverlayEvent): boolean => {
        overlayIdsRef.current.delete(event.overlay.id);
        if (selectedIdRef.current === event.overlay.id) selectOverlay(null);
        if (hoveredIdRef.current === event.overlay.id) {
          hoveredIdRef.current = null;
          setHoveredId(null);
        }
        if (!suppressEventsRef.current) schedulePersist();
        return true;
      },
      [schedulePersist, selectOverlay],
    );

    const overlayCallbacks = useCallback(
      (): Partial<OverlayCreate> => ({
        onSelected: onOverlaySelected,
        onDeselected: onOverlayDeselected,
        onMouseEnter: onOverlayMouseEnter,
        onMouseLeave: onOverlayMouseLeave,
        onDrawEnd: onOverlayDrawEnd,
        onPressedMoveStart: onOverlayPressedMoveStart,
        onPressedMoveEnd: onOverlayPressedMoveEnd,
        onRemoved: onOverlayRemoved,
      }),
      [
        onOverlayDeselected,
        onOverlayDrawEnd,
        onOverlayMouseEnter,
        onOverlayMouseLeave,
        onOverlayPressedMoveEnd,
        onOverlayPressedMoveStart,
        onOverlayRemoved,
        onOverlaySelected,
      ],
    );

    const managedOverlay = useCallback(
      (drawing: Drawing): OverlayCreate => {
        const overlay: OverlayCreate = {
          id: drawing.id,
          name: drawing.name,
          ...overlayCallbacks(),
        };
        if (drawing.groupId !== undefined) overlay.groupId = drawing.groupId;
        if (drawing.lock !== undefined) overlay.lock = drawing.lock;
        if (drawing.visible !== undefined) overlay.visible = drawing.visible;
        if (drawing.zLevel !== undefined) overlay.zLevel = drawing.zLevel;
        if (drawing.mode !== undefined) {
          overlay.mode = drawing.mode as Exclude<OverlayCreate['mode'], undefined>;
        }
        if (drawing.styles !== undefined) {
          overlay.styles = drawing.styles as Exclude<OverlayCreate['styles'], undefined>;
        }
        if (drawing.points.length > 0) {
          overlay.points = drawing.points as Exclude<OverlayCreate['points'], undefined>;
        }
        if (drawing.extendData !== undefined) overlay.extendData = drawing.extendData;
        return overlay;
      },
      [overlayCallbacks],
    );

    const clearTrackedOverlays = useCallback(() => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      suppressEventsRef.current = true;
      try {
        for (const id of overlayIdsRef.current) chartApi.removeOverlay(id);
      } finally {
        suppressEventsRef.current = false;
      }
      overlayIdsRef.current.clear();
      selectOverlay(null);
      setHoveredId(null);
      hoveredIdRef.current = null;
    }, [selectOverlay]);

    const importSnapshot = useCallback(
      (drawings: readonly Drawing[]) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        clearTrackedOverlays();
        suppressEventsRef.current = true;
        for (const drawing of drawings) {
          try {
            const id = chartApi.createOverlay(managedOverlay(drawing));
            if (typeof id === 'string') overlayIdsRef.current.add(id);
          } catch {
            // Skip drawings unsupported by this klinecharts registry.
          }
        }
        suppressEventsRef.current = false;
        selectOverlay(null);
        schedulePersist();
      },
      [clearTrackedOverlays, managedOverlay, schedulePersist, selectOverlay],
    );

    const removeOverlay = useCallback(
      (id: string | null) => {
        const chartApi = chartApiRef.current;
        if (!chartApi || !id || !overlayIdsRef.current.has(id)) return;
        pushUndoSnapshot();
        chartApi.removeOverlay(id);
        selectOverlay(null);
        schedulePersist();
        updateHistoryState();
      },
      [pushUndoSnapshot, schedulePersist, selectOverlay, updateHistoryState],
    );

    const undo = useCallback(() => {
      const previous = undoStackRef.current.pop();
      if (!previous) return;
      redoStackRef.current = [
        ...redoStackRef.current.slice(-39),
        cloneDrawings(exportCurrentDrawings()),
      ];
      importSnapshot(previous);
      updateHistoryState();
    }, [exportCurrentDrawings, importSnapshot, updateHistoryState]);

    const redo = useCallback(() => {
      const next = redoStackRef.current.pop();
      if (!next) return;
      undoStackRef.current = [
        ...undoStackRef.current.slice(-39),
        cloneDrawings(exportCurrentDrawings()),
      ];
      importSnapshot(next);
      updateHistoryState();
    }, [exportCurrentDrawings, importSnapshot, updateHistoryState]);

    const toggleLock = useCallback(() => {
      const chartApi = chartApiRef.current;
      const id = selectedIdRef.current;
      if (!chartApi || !id) return;
      const overlay = chartApi.getOverlayById(id);
      if (!overlay) return;
      pushUndoSnapshot();
      chartApi.overrideOverlay({ id, lock: !overlay.lock });
      schedulePersist();
      updateHistoryState();
    }, [pushUndoSnapshot, schedulePersist, updateHistoryState]);

    const toggleVisible = useCallback(() => {
      const chartApi = chartApiRef.current;
      const id = selectedIdRef.current;
      if (!chartApi || !id) return;
      const overlay = chartApi.getOverlayById(id);
      if (!overlay) return;
      pushUndoSnapshot();
      chartApi.overrideOverlay({ id, visible: !overlay.visible });
      schedulePersist();
      updateHistoryState();
    }, [pushUndoSnapshot, schedulePersist, updateHistoryState]);

    const handleChartReady = useCallback(
      (chart: Chart) => {
        for (const cleanup of chartActionCleanupRef.current) cleanup();
        chartActionCleanupRef.current = [];
        chartApiRef.current = chart;
        const reposition = () => updateToolbarPosition(selectedIdRef.current);
        chart.subscribeAction(ActionType.OnScroll, reposition);
        chart.subscribeAction(ActionType.OnZoom, reposition);
        chart.subscribeAction(ActionType.OnVisibleRangeChange, reposition);
        chartActionCleanupRef.current = [
          () => chart.unsubscribeAction(ActionType.OnScroll, reposition),
          () => chart.unsubscribeAction(ActionType.OnZoom, reposition),
          () => chart.unsubscribeAction(ActionType.OnVisibleRangeChange, reposition),
        ];
      },
      [updateToolbarPosition],
    );

    useEffect(
      () => () => {
        for (const cleanup of chartActionCleanupRef.current) cleanup();
        chartActionCleanupRef.current = [];
      },
      [],
    );

    const handleDataReady = useCallback(
      (data: KLineData[]) => {
        fullDataRef.current = data;
        onBoundsRef.current?.(panel.id, boundsFromData(data));
        updateToolbarPosition(selectedIdRef.current);
      },
      [panel.id, updateToolbarPosition],
    );

    const handleAppliedKeyChange = useCallback((key: string) => {
      setAppliedDataKey(key);
    }, []);

    useEffect(() => {
      const key = `${panel.symbolId ?? ''}|${panel.interval}|${panel.drawingScopeId}`;
      if (loadKeyRef.current === key) return;
      loadKeyRef.current = key;
      drawingLoadSeqRef.current += 1;
      fullDataRef.current = [];
      setAppliedDataKey('');
      hadCursorRef.current = false;
      clearTrackedOverlays();
      onBoundsRef.current?.(panel.id, null);
    }, [clearTrackedOverlays, panel.drawingScopeId, panel.id, panel.interval, panel.symbolId]);

    const loadDrawings = useCallback(async () => {
      const chartApi = chartApiRef.current;
      if (!chartApi || !panel.symbolId) return;

      const requestSeq = ++drawingLoadSeqRef.current;
      const requestKey = `${panel.symbolId ?? ''}|${panel.interval}|${panel.drawingScopeId}`;
      clearTrackedOverlays();
      undoStackRef.current = [];
      redoStackRef.current = [];
      updateHistoryState();
      try {
        const res = await api.drawings(panel.symbolId, panel.interval, panel.drawingScopeId);
        if (requestSeq !== drawingLoadSeqRef.current || requestKey !== loadKeyRef.current) return;
        suppressEventsRef.current = true;
        try {
          for (const drawing of res.drawings) {
            try {
              const id = chartApi.createOverlay(managedOverlay(drawing));
              if (typeof id === 'string') overlayIdsRef.current.add(id);
            } catch {
              // Skip drawings unsupported by this klinecharts registry.
            }
          }
        } finally {
          suppressEventsRef.current = false;
        }
        updateHistoryState();
      } catch {
        suppressEventsRef.current = false;
      }
    }, [
      clearTrackedOverlays,
      managedOverlay,
      panel.drawingScopeId,
      panel.interval,
      panel.symbolId,
      updateHistoryState,
    ]);

    useEffect(() => {
      if (appliedDataKey === '') return;
      if (fullDataRef.current.length === 0) return;
      void loadDrawings();
    }, [appliedDataKey, loadDrawings, panel.symbolId, panel.interval, panel.drawingScopeId]);

    useEffect(() => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;

      if (!replayActive) {
        if (hadCursorRef.current && fullDataRef.current.length > 0) {
          chartApi.applyNewData(fullDataRef.current, false);
          chartApi.scrollToRealTime();
        }
        hadCursorRef.current = false;
        return;
      }

      hadCursorRef.current = true;
      if (replayCursor == null || fullDataRef.current.length === 0) return;

      const filtered = fullDataRef.current.filter((k) => k.timestamp <= replayCursor * 1000);

      if (filtered.length > 0) {
        chartApi.applyNewData(filtered, false);
        chartApi.scrollToRealTime();
      }
    }, [replayActive, replayCursor]);

    const createDrawing = useCallback(
      (name: string) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        pushUndoSnapshot();
        setActiveTool(name);
        const id = chartApi.createOverlay(name);
        if (typeof id === 'string') {
          overlayIdsRef.current.add(id);
          chartApi.overrideOverlay({ id, ...overlayCallbacks() });
        }
        updateHistoryState();
      },
      [overlayCallbacks, pushUndoSnapshot, updateHistoryState],
    );

    const cursorMode = useCallback(() => {
      setActiveTool(null);
      selectOverlay(null);
    }, [selectOverlay]);

    useEffect(() => {
      if (!active) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          removeOverlay(selectedIdRef.current);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cursorMode();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, cursorMode, redo, removeOverlay, undo]);

    const handleAuxClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 1) return;
        const target = hoveredIdRef.current;
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        removeOverlay(target);
      },
      [removeOverlay],
    );

    useImperativeHandle(
      ref,
      () => ({
        exportDrawings: exportCurrentDrawings,
        importDrawings(drawings: Drawing[]): void {
          importSnapshot(drawings);
        },
      }),
      [exportCurrentDrawings, importSnapshot],
    );

    useEffect(() => {
      if (!import.meta.env.VITE_E2E) return;
      const state: DrawingDebugState = {
        panelId: panel.id,
        active,
        overlayCount: overlayIdsRef.current.size,
        selectedId,
        hoveredId,
        activeTool,
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
      };
      window.__TV_E2E_DRAWINGS__ = {
        ...(window.__TV_E2E_DRAWINGS__ ?? {}),
        [panel.id]: state,
        ...(active ? { active: state } : {}),
      };
    }, [active, activeTool, historyVersion, hoveredId, panel.id, selectedId]);

    if (!symbol) {
      return (
        <div className={`chart-panel${active ? ' active' : ''}`} onMouseDown={onActivate}>
          <div className="chart-panel-empty">No symbol</div>
        </div>
      );
    }

    const selectedOverlay = selectedId
      ? (chartApiRef.current?.getOverlayById(selectedId) ?? null)
      : null;
    const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
    const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;

    return (
      <div
        className={`chart-panel${active ? ' active' : ''}`}
        onMouseDown={onActivate}
        onAuxClick={handleAuxClick}
      >
        <div className="chart-panel-tools" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={`chart-tool-btn${activeTool === null ? ' active' : ''}`}
            onClick={cursorMode}
            title="Cursor"
            aria-label="Cursor"
          >
            <MousePointer2 size={16} />
          </button>
          <span className="chart-tool-divider" />
          {DRAWING_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.name}
                type="button"
                className={`chart-tool-btn${activeTool === tool.name ? ' active' : ''}`}
                onClick={() => createDrawing(tool.name)}
                title={tool.label}
                aria-label={tool.label}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <span className="chart-tool-divider" />
          <button
            type="button"
            className="chart-tool-btn"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="chart-tool-btn"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        {selectedOverlay && toolbarPoint && (
          <div
            className="chart-drawing-popover"
            style={{ left: toolbarPoint.x, top: Math.max(8, toolbarPoint.y - 42) }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="chart-tool-btn"
              onClick={toggleLock}
              title={selectedOverlay.lock ? 'Unlock drawing' : 'Lock drawing'}
              aria-label={selectedOverlay.lock ? 'Unlock drawing' : 'Lock drawing'}
            >
              {selectedOverlay.lock ? <LockOpen size={15} /> : <Lock size={15} />}
            </button>
            <button
              type="button"
              className="chart-tool-btn"
              onClick={toggleVisible}
              title={selectedOverlay.visible ? 'Hide drawing' : 'Show drawing'}
              aria-label={selectedOverlay.visible ? 'Hide drawing' : 'Show drawing'}
            >
              {selectedOverlay.visible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              type="button"
              className="chart-tool-btn danger"
              onClick={() => removeOverlay(selectedId)}
              title="Delete drawing"
              aria-label="Delete drawing"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}

        <div className="chart-panel-chart">
          <KLineChartSurface
            ref={chartHandleRef}
            symbol={symbol}
            interval={panel.interval}
            live={live}
            onChartReady={handleChartReady}
            onDataReady={handleDataReady}
            onAppliedKeyChange={handleAppliedKeyChange}
          />
        </div>
      </div>
    );
  },
);
