import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActionType,
  type Chart,
  type KLineData,
  type Overlay,
  type OverlayCreate,
  type OverlayEvent,
} from 'klinecharts';
import type { Panel } from '@tv/layout-sync';
import type { Drawing } from '@tv/core';
import { api } from '../api/client';
import type { Symbol as TvSymbol } from '../api/types';
import { KLineChartSurface, type KLineChartSurfaceHandle } from './KLineChartSurface';
import { alpha, token, type ChartSettings } from './theme';
import { SEMANTIC_COLOR_OVERLAYS, TEXT_OVERLAYS, FILLED_OVERLAYS } from './overlays';
import type { DrawingWorkspaceState, MagnetMode } from './ChartToolbar';
import { DrawingStyleBar, type DrawingStyleValue, type LineStyleKind } from './DrawingStyleBar';

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
  settings: ChartSettings;
  activeTool: string | null;
  /** Bumped by the workspace to re-arm the same tool (stay-in-drawing-mode). */
  toolNonce: number;
  magnet: MagnetMode;
  onToolConsumed: () => void;
  onActivate: () => void;
  onDrawingState: (panelId: string, state: DrawingWorkspaceState) => void;
  onRequestAlert?: ((price: number) => void) | undefined;
  replayActive?: boolean | undefined;
  replayCursor?: number | null | undefined;
  onBounds?: ((id: string, bounds: PanelBounds | null) => void) | undefined;
}

export interface KLineChartPanelHandle {
  exportDrawings(): Drawing[];
  importDrawings(drawings: Drawing[]): void;
  undo(): void;
  redo(): void;
  setAllVisible(visible: boolean): void;
  setAllLocked(locked: boolean): void;
  removeAll(): void;
  screenshotUrl(): string | null;
  lastClose(): number | null;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  price: number;
  timestamp: number | null;
}

interface TextEditorState {
  overlayId: string;
  x: number;
  y: number;
  draft: string;
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

const MAGNET_TO_MODE: Record<MagnetMode, 'normal' | 'weak_magnet' | 'strong_magnet'> = {
  off: 'normal',
  weak: 'weak_magnet',
  strong: 'strong_magnet',
};

/**
 * Drawings belong to the symbol — one set shared across intervals, panels,
 * layouts, and reloads (points are timestamp-anchored, so they render on any
 * timeframe). The interval slot in the API is pinned to a constant.
 */
export const DRAWING_INTERVAL = 'any';
export const drawingScopeFor = (symbolId: string): string => `symbol:${symbolId}`;

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

const cloneDrawings = (drawings: readonly Drawing[]): Drawing[] => drawings.map(cloneDrawing);

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

/** Current editable style of an overlay, for the style bar. */
function styleValueOf(ov: Overlay): DrawingStyleValue {
  const line = (ov.styles?.line ?? {}) as {
    color?: string;
    size?: number;
    style?: string;
    dashedValue?: number[];
  };
  const lineStyle: LineStyleKind =
    line.style === 'dashed' ? ((line.dashedValue?.[0] ?? 4) <= 2 ? 'dotted' : 'dashed') : 'solid';
  return {
    color: line.color ?? token('--accent'),
    size: line.size ?? 1,
    lineStyle,
    locked: ov.lock,
    visible: ov.visible,
    showPalette: !SEMANTIC_COLOR_OVERLAYS.has(ov.name),
    hasText: TEXT_OVERLAYS.has(ov.name),
  };
}

export const KLineChartPanel = forwardRef<KLineChartPanelHandle, ChartPanelProps>(
  function KLineChartPanel(
    {
      panel,
      symbol,
      active,
      live,
      settings,
      activeTool,
      toolNonce,
      magnet,
      onToolConsumed,
      onActivate,
      onDrawingState,
      onRequestAlert,
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
    const creatingIdRef = useRef<string | null>(null);
    const loadedSymbolRef = useRef('');

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [stylePoint, setStylePoint] = useState<PixelPoint | null>(null);
    const [styleVersion, setStyleVersion] = useState(0);
    const [historyVersion, setHistoryVersion] = useState(0);
    const [appliedDataKey, setAppliedDataKey] = useState('');
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);

    const onBoundsRef = useRef(onBounds);
    onBoundsRef.current = onBounds;
    selectedIdRef.current = selectedId;
    hoveredIdRef.current = hoveredId;

    /* ── Export / persistence ─────────────────────────────────────────── */

    const exportCurrentDrawings = useCallback((): Drawing[] => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return [];
      const drawings: Drawing[] = [];
      for (const id of overlayIdsRef.current) {
        const ov = chartApi.getOverlayById(id);
        if (ov) drawings.push(overlayToDrawing(ov));
      }
      return drawings;
    }, []);

    const schedulePersist = useCallback(() => {
      if (!panel.symbolId) return;
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
      const symbolId = panel.symbolId;
      const drawings = exportCurrentDrawings();
      persistTimerRef.current = window.setTimeout(() => {
        void api
          .saveDrawings(symbolId, DRAWING_INTERVAL, drawings, drawingScopeFor(symbolId))
          .catch(() => {
            return;
          });
      }, 350);
    }, [exportCurrentDrawings, panel.symbolId]);

    useEffect(
      () => () => {
        if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
      },
      [],
    );

    /* ── Drawing state reporting (toolbar) ────────────────────────────── */

    const reportDrawingState = useCallback(() => {
      const chartApi = chartApiRef.current;
      const count = overlayIdsRef.current.size;
      let allHidden = count > 0;
      let allLocked = count > 0;
      if (chartApi) {
        for (const id of overlayIdsRef.current) {
          const ov = chartApi.getOverlayById(id);
          if (!ov) continue;
          if (ov.visible) allHidden = false;
          if (!ov.lock) allLocked = false;
        }
      }
      onDrawingState(panel.id, {
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
        allHidden,
        allLocked,
        count,
      });
    }, [onDrawingState, panel.id]);

    const updateHistoryState = useCallback(() => {
      setHistoryVersion((version) => version + 1);
      reportDrawingState();
    }, [reportDrawingState]);

    const pushUndoSnapshot = useCallback(() => {
      undoStackRef.current = [
        ...undoStackRef.current.slice(-39),
        cloneDrawings(exportCurrentDrawings()),
      ];
      redoStackRef.current = [];
      updateHistoryState();
    }, [exportCurrentDrawings, updateHistoryState]);

    /* ── Selection + style bar ────────────────────────────────────────── */

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

    const updateStyleBarPosition = useCallback(
      (id: string | null) => {
        setStylePoint(overlayPosition(id));
      },
      [overlayPosition],
    );

    const selectOverlay = useCallback(
      (id: string | null) => {
        setSelectedId(id);
        selectedIdRef.current = id;
        updateStyleBarPosition(id);
      },
      [updateStyleBarPosition],
    );

    /* ── Regression trend: deviation from the drawn base line ─────────── */

    const updateRegressionDeviation = useCallback((overlayId: string) => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      const ov = chartApi.getOverlayById(overlayId);
      if (!ov || ov.name !== 'regressionTrend') return;
      const [a, b] = [ov.points[0], ov.points[1]];
      if (
        a?.timestamp === undefined ||
        b?.timestamp === undefined ||
        a.value === undefined ||
        b.value === undefined ||
        a.timestamp === b.timestamp
      ) {
        return;
      }
      const t1 = Math.min(a.timestamp, b.timestamp);
      const t2 = Math.max(a.timestamp, b.timestamp);
      const bars = fullDataRef.current.filter((k) => k.timestamp >= t1 && k.timestamp <= t2);
      if (bars.length < 2) return;
      const slope = (b.value - a.value) / (b.timestamp - a.timestamp);
      let sum = 0;
      for (const k of bars) {
        const lineValue = a.value + (k.timestamp - a.timestamp) * slope;
        const d = k.close - lineValue;
        sum += d * d;
      }
      const sd = Math.sqrt(sum / bars.length);
      suppressEventsRef.current = true;
      chartApi.overrideOverlay({ id: overlayId, extendData: { deviation: 2 * sd } });
      suppressEventsRef.current = false;
    }, []);

    /* ── Text editing (text/callout overlays) ─────────────────────────── */

    const openTextEditor = useCallback(
      (overlayId: string) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        const ov = chartApi.getOverlayById(overlayId);
        if (!ov || !TEXT_OVERLAYS.has(ov.name)) return;
        const pos = overlayPosition(overlayId);
        if (!pos) return;
        const current = (ov.extendData as { text?: string } | undefined)?.text ?? '';
        setTextEditor({ overlayId, x: pos.x, y: pos.y, draft: current });
      },
      [overlayPosition],
    );

    const commitTextEditor = useCallback(
      (save: boolean) => {
        setTextEditor((editor) => {
          if (editor && save) {
            const chartApi = chartApiRef.current;
            const value = editor.draft.trim();
            chartApi?.overrideOverlay({
              id: editor.overlayId,
              extendData: { text: value === '' ? 'Text' : value },
            });
            schedulePersist();
          }
          return null;
        });
      },
      [schedulePersist],
    );

    /* ── Overlay event callbacks ──────────────────────────────────────── */

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

    const onOverlayDoubleClick = useCallback(
      (event: OverlayEvent): boolean => {
        if (TEXT_OVERLAYS.has(event.overlay.name)) {
          openTextEditor(event.overlay.id);
          return true;
        }
        return false;
      },
      [openTextEditor],
    );

    const onOverlayDrawEnd = useCallback(
      (event: OverlayEvent): boolean => {
        if (suppressEventsRef.current) return true;
        overlayIdsRef.current.add(event.overlay.id);
        creatingIdRef.current = null;
        if (event.overlay.name === 'regressionTrend') updateRegressionDeviation(event.overlay.id);
        onToolConsumed();
        selectOverlay(event.overlay.id);
        if (TEXT_OVERLAYS.has(event.overlay.name)) openTextEditor(event.overlay.id);
        schedulePersist();
        reportDrawingState();
        return true;
      },
      [
        onToolConsumed,
        openTextEditor,
        reportDrawingState,
        schedulePersist,
        selectOverlay,
        updateRegressionDeviation,
      ],
    );

    const onOverlayPressedMoveStart = useCallback((): boolean => {
      if (!suppressEventsRef.current) pushUndoSnapshot();
      return true;
    }, [pushUndoSnapshot]);

    const onOverlayPressedMoveEnd = useCallback(
      (event: OverlayEvent): boolean => {
        if (suppressEventsRef.current) return true;
        if (event.overlay.name === 'regressionTrend') updateRegressionDeviation(event.overlay.id);
        selectOverlay(event.overlay.id);
        schedulePersist();
        return true;
      },
      [schedulePersist, selectOverlay, updateRegressionDeviation],
    );

    const onOverlayRemoved = useCallback(
      (event: OverlayEvent): boolean => {
        overlayIdsRef.current.delete(event.overlay.id);
        if (creatingIdRef.current === event.overlay.id) creatingIdRef.current = null;
        if (selectedIdRef.current === event.overlay.id) selectOverlay(null);
        if (hoveredIdRef.current === event.overlay.id) {
          hoveredIdRef.current = null;
          setHoveredId(null);
        }
        if (!suppressEventsRef.current) {
          schedulePersist();
          reportDrawingState();
        }
        return true;
      },
      [reportDrawingState, schedulePersist, selectOverlay],
    );

    const overlayCallbacks = useCallback(
      (): Partial<OverlayCreate> => ({
        onSelected: onOverlaySelected,
        onDeselected: onOverlayDeselected,
        onMouseEnter: onOverlayMouseEnter,
        onMouseLeave: onOverlayMouseLeave,
        onDoubleClick: onOverlayDoubleClick,
        onDrawEnd: onOverlayDrawEnd,
        onPressedMoveStart: onOverlayPressedMoveStart,
        onPressedMoveEnd: onOverlayPressedMoveEnd,
        onRemoved: onOverlayRemoved,
      }),
      [
        onOverlayDeselected,
        onOverlayDoubleClick,
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

    /* ── Bulk operations ──────────────────────────────────────────────── */

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
        reportDrawingState();
      },
      [clearTrackedOverlays, managedOverlay, reportDrawingState, schedulePersist, selectOverlay],
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

    const setAllVisible = useCallback(
      (visible: boolean) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        suppressEventsRef.current = true;
        for (const id of overlayIdsRef.current) chartApi.overrideOverlay({ id, visible });
        suppressEventsRef.current = false;
        schedulePersist();
        reportDrawingState();
      },
      [reportDrawingState, schedulePersist],
    );

    const setAllLocked = useCallback(
      (locked: boolean) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        suppressEventsRef.current = true;
        for (const id of overlayIdsRef.current) chartApi.overrideOverlay({ id, lock: locked });
        suppressEventsRef.current = false;
        schedulePersist();
        reportDrawingState();
      },
      [reportDrawingState, schedulePersist],
    );

    const removeAll = useCallback(() => {
      if (overlayIdsRef.current.size === 0) return;
      pushUndoSnapshot();
      clearTrackedOverlays();
      schedulePersist();
      updateHistoryState();
    }, [clearTrackedOverlays, pushUndoSnapshot, schedulePersist, updateHistoryState]);

    /* ── Selected-overlay styling ─────────────────────────────────────── */

    const patchSelectedStyles = useCallback(
      (patch: { color?: string; size?: number; lineStyle?: LineStyleKind }) => {
        const chartApi = chartApiRef.current;
        const id = selectedIdRef.current;
        if (!chartApi || !id) return;
        const ov = chartApi.getOverlayById(id);
        if (!ov) return;
        pushUndoSnapshot();
        const current = styleValueOf(ov);
        const color = patch.color ?? current.color;
        const size = patch.size ?? current.size;
        const kind = patch.lineStyle ?? current.lineStyle;
        const line =
          kind === 'solid'
            ? { color, size, style: 'solid', dashedValue: [4, 4] }
            : kind === 'dashed'
              ? { color, size, style: 'dashed', dashedValue: [5, 5] }
              : { color, size, style: 'dashed', dashedValue: [2, 4] };
        const fillAlpha = FILLED_OVERLAYS.has(ov.name) ? 0.14 : 0.1;
        chartApi.overrideOverlay({
          id,
          styles: {
            line,
            polygon: { borderColor: color, borderSize: size, color: alpha(color, fillAlpha) },
            circle: { borderColor: color, borderSize: size, color: alpha(color, fillAlpha) },
            text: { color },
          } as never,
        });
        setStyleVersion((v) => v + 1);
        schedulePersist();
      },
      [pushUndoSnapshot, schedulePersist],
    );

    const toggleSelectedLock = useCallback(() => {
      const chartApi = chartApiRef.current;
      const id = selectedIdRef.current;
      if (!chartApi || !id) return;
      const overlay = chartApi.getOverlayById(id);
      if (!overlay) return;
      pushUndoSnapshot();
      chartApi.overrideOverlay({ id, lock: !overlay.lock });
      setStyleVersion((v) => v + 1);
      schedulePersist();
      reportDrawingState();
    }, [pushUndoSnapshot, reportDrawingState, schedulePersist]);

    const toggleSelectedVisible = useCallback(() => {
      const chartApi = chartApiRef.current;
      const id = selectedIdRef.current;
      if (!chartApi || !id) return;
      const overlay = chartApi.getOverlayById(id);
      if (!overlay) return;
      pushUndoSnapshot();
      chartApi.overrideOverlay({ id, visible: !overlay.visible });
      setStyleVersion((v) => v + 1);
      schedulePersist();
      reportDrawingState();
    }, [pushUndoSnapshot, reportDrawingState, schedulePersist]);

    const cloneSelected = useCallback(() => {
      const chartApi = chartApiRef.current;
      const id = selectedIdRef.current;
      if (!chartApi || !id) return;
      const ov = chartApi.getOverlayById(id);
      if (!ov) return;
      pushUndoSnapshot();
      const drawing = overlayToDrawing(ov);
      const data = fullDataRef.current;
      const stepMs = data.length > 1 ? data[1]!.timestamp - data[0]!.timestamp : 3_600_000;
      const copy: Drawing = {
        ...cloneDrawing(drawing),
        id: `dr_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
        points: drawing.points.map((p) => ({
          ...p,
          timestamp: p.timestamp !== undefined ? p.timestamp + stepMs * 3 : p.timestamp,
          dataIndex: undefined,
        })),
      };
      try {
        const newId = chartApi.createOverlay(managedOverlay(copy));
        if (typeof newId === 'string') {
          overlayIdsRef.current.add(newId);
          selectOverlay(newId);
        }
      } catch {
        return;
      }
      schedulePersist();
      updateHistoryState();
    }, [managedOverlay, pushUndoSnapshot, schedulePersist, selectOverlay, updateHistoryState]);

    /* ── Chart lifecycle ──────────────────────────────────────────────── */

    const handleChartReady = useCallback(
      (chart: Chart) => {
        for (const cleanup of chartActionCleanupRef.current) cleanup();
        chartActionCleanupRef.current = [];
        chartApiRef.current = chart;
        const reposition = () => updateStyleBarPosition(selectedIdRef.current);
        chart.subscribeAction(ActionType.OnScroll, reposition);
        chart.subscribeAction(ActionType.OnZoom, reposition);
        chart.subscribeAction(ActionType.OnVisibleRangeChange, reposition);
        chartActionCleanupRef.current = [
          () => chart.unsubscribeAction(ActionType.OnScroll, reposition),
          () => chart.unsubscribeAction(ActionType.OnZoom, reposition),
          () => chart.unsubscribeAction(ActionType.OnVisibleRangeChange, reposition),
        ];
      },
      [updateStyleBarPosition],
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
        updateStyleBarPosition(selectedIdRef.current);
      },
      [panel.id, updateStyleBarPosition],
    );

    const handleAppliedKeyChange = useCallback((key: string) => {
      setAppliedDataKey(key);
    }, []);

    // Interval changes keep the overlays (they're timestamp-anchored); only a
    // symbol change resets the drawing set.
    useEffect(() => {
      const key = panel.symbolId ?? '';
      if (loadKeyRef.current === key) return;
      loadKeyRef.current = key;
      loadedSymbolRef.current = '';
      drawingLoadSeqRef.current += 1;
      fullDataRef.current = [];
      setAppliedDataKey('');
      hadCursorRef.current = false;
      setTextEditor(null);
      setContextMenu(null);
      clearTrackedOverlays();
      onBoundsRef.current?.(panel.id, null);
    }, [clearTrackedOverlays, panel.id, panel.symbolId]);

    const loadDrawings = useCallback(async () => {
      const chartApi = chartApiRef.current;
      if (!chartApi || !panel.symbolId) return;

      const requestSeq = ++drawingLoadSeqRef.current;
      const requestKey = panel.symbolId ?? '';
      clearTrackedOverlays();
      undoStackRef.current = [];
      redoStackRef.current = [];
      updateHistoryState();
      try {
        const res = await api.drawings(
          panel.symbolId,
          DRAWING_INTERVAL,
          drawingScopeFor(panel.symbolId),
        );
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
    }, [clearTrackedOverlays, managedOverlay, panel.symbolId, updateHistoryState]);

    useEffect(() => {
      if (appliedDataKey === '') return;
      if (fullDataRef.current.length === 0) return;
      const sym = panel.symbolId ?? '';
      if (loadedSymbolRef.current === sym) return;
      loadedSymbolRef.current = sym;
      void loadDrawings();
    }, [appliedDataKey, loadDrawings, panel.symbolId]);

    /* ── Replay ───────────────────────────────────────────────────────── */

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

    /* ── Tool activation (from the workspace toolbar) ─────────────────── */

    const cancelCreating = useCallback(() => {
      const chartApi = chartApiRef.current;
      const creating = creatingIdRef.current;
      if (chartApi && creating) {
        suppressEventsRef.current = true;
        chartApi.removeOverlay(creating);
        suppressEventsRef.current = false;
        overlayIdsRef.current.delete(creating);
        creatingIdRef.current = null;
        // The pre-creation snapshot is no longer a state change.
        undoStackRef.current.pop();
        updateHistoryState();
      }
    }, [updateHistoryState]);

    useEffect(() => {
      if (!active) return;
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      cancelCreating();
      if (!activeTool) return;
      pushUndoSnapshot();
      const id = chartApi.createOverlay({
        name: activeTool,
        mode: MAGNET_TO_MODE[magnet] as Exclude<OverlayCreate['mode'], undefined>,
        ...overlayCallbacks(),
      });
      if (typeof id === 'string') {
        overlayIdsRef.current.add(id);
        creatingIdRef.current = id;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTool, toolNonce, active]);

    // Magnet applies to existing drawings' point dragging too.
    useEffect(() => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      suppressEventsRef.current = true;
      for (const id of overlayIdsRef.current) {
        chartApi.overrideOverlay({
          id,
          mode: MAGNET_TO_MODE[magnet] as Exclude<OverlayCreate['mode'], undefined>,
        });
      }
      suppressEventsRef.current = false;
    }, [magnet]);

    /* ── Keyboard ─────────────────────────────────────────────────────── */

    useEffect(() => {
      if (!active) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
        ) {
          return;
        }
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
          setContextMenu(null);
          cancelCreating();
          onToolConsumed();
          selectOverlay(null);
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, cancelCreating, onToolConsumed, redo, removeOverlay, selectOverlay, undo]);

    /* ── Mouse extras ─────────────────────────────────────────────────── */

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

    const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      const chartApi = chartApiRef.current;
      if (!chartApi) return;
      event.preventDefault();
      const host = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - host.left;
      const y = event.clientY - host.top;
      const converted = chartApi.convertFromPixel([{ x, y }], {
        paneId: 'candle_pane',
        absolute: false,
      });
      const point = Array.isArray(converted) ? converted[0] : converted;
      const price = point && typeof point.value === 'number' ? point.value : null;
      if (price == null) return;
      const timestamp = point && typeof point.timestamp === 'number' ? point.timestamp : null;
      setContextMenu({ x, y, price, timestamp });
    }, []);

    useEffect(() => {
      if (!contextMenu) return;
      const close = () => setContextMenu(null);
      window.addEventListener('mousedown', close);
      return () => window.removeEventListener('mousedown', close);
    }, [contextMenu]);

    const addHorizontalLineAt = useCallback(
      (price: number) => {
        const chartApi = chartApiRef.current;
        if (!chartApi) return;
        pushUndoSnapshot();
        try {
          const id = chartApi.createOverlay({
            name: 'horizontalStraightLine',
            points: [{ value: price }],
            ...overlayCallbacks(),
          });
          if (typeof id === 'string') overlayIdsRef.current.add(id);
        } catch {
          return;
        }
        schedulePersist();
        updateHistoryState();
      },
      [overlayCallbacks, pushUndoSnapshot, schedulePersist, updateHistoryState],
    );

    /* ── Imperative API ───────────────────────────────────────────────── */

    useImperativeHandle(
      ref,
      () => ({
        exportDrawings: exportCurrentDrawings,
        importDrawings(drawings: Drawing[]): void {
          importSnapshot(drawings);
        },
        undo,
        redo,
        setAllVisible,
        setAllLocked,
        removeAll,
        screenshotUrl(): string | null {
          try {
            return (
              chartApiRef.current?.getConvertPictureUrl(true, 'png', token('--surface-0')) ?? null
            );
          } catch {
            return null;
          }
        },
        lastClose(): number | null {
          const data = fullDataRef.current;
          return data.length > 0 ? data[data.length - 1]!.close : null;
        },
      }),
      [exportCurrentDrawings, importSnapshot, redo, removeAll, setAllLocked, setAllVisible, undo],
    );

    /* ── E2E debug bridge ─────────────────────────────────────────────── */

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

    /* ── Render ───────────────────────────────────────────────────────── */

    if (!symbol) {
      return (
        <div className={`chart-panel${active ? ' active' : ''}`} onMouseDown={onActivate}>
          <div className="chart-panel-empty">
            <span>No symbol</span>
            <button
              type="button"
              className="sm"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                onActivate();
                window.dispatchEvent(new CustomEvent('tv:open-cmdk'));
              }}
            >
              Pick symbol
            </button>
          </div>
        </div>
      );
    }

    const selectedOverlay =
      selectedId && styleVersion >= 0
        ? (chartApiRef.current?.getOverlayById(selectedId) ?? null)
        : null;

    return (
      <div
        className={`chart-panel${active ? ' active' : ''}`}
        onMouseDown={onActivate}
        onAuxClick={handleAuxClick}
        onContextMenu={handleContextMenu}
      >
        {selectedOverlay && stylePoint && !textEditor && (
          <DrawingStyleBar
            value={styleValueOf(selectedOverlay)}
            position={{ x: stylePoint.x, y: Math.max(8, stylePoint.y - 46) }}
            onColor={(color) => patchSelectedStyles({ color })}
            onSize={(size) => patchSelectedStyles({ size })}
            onLineStyle={(lineStyle) => patchSelectedStyles({ lineStyle })}
            onEditText={() => openTextEditor(selectedOverlay.id)}
            onClone={cloneSelected}
            onToggleLock={toggleSelectedLock}
            onToggleVisible={toggleSelectedVisible}
            onDelete={() => removeOverlay(selectedId)}
          />
        )}

        {textEditor && (
          <div
            className="chart-text-editor"
            style={{ left: textEditor.x, top: Math.max(8, textEditor.y - 40) }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={textEditor.draft}
              placeholder="Text…"
              onChange={(e) => setTextEditor((s) => (s ? { ...s, draft: e.target.value } : s))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTextEditor(true);
                if (e.key === 'Escape') commitTextEditor(false);
                e.stopPropagation();
              }}
              onBlur={() => commitTextEditor(true)}
            />
          </div>
        )}

        {contextMenu && (
          <div
            className="chart-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {onRequestAlert && (
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  onRequestAlert(contextMenu.price);
                }}
              >
                Alert at {contextMenu.price.toPrecision(6)}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                addHorizontalLineAt(contextMenu.price);
                setContextMenu(null);
              }}
            >
              Horizontal line here
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(String(contextMenu.price));
                setContextMenu(null);
              }}
            >
              Copy price
            </button>
          </div>
        )}

        <div className="chart-panel-chart">
          <KLineChartSurface
            ref={chartHandleRef}
            symbol={symbol}
            interval={panel.interval}
            chartType={panel.chartType}
            settings={settings}
            indicators={panel.indicators}
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
