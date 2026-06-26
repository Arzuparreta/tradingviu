import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCent,
  ChartSpline,
  ClipboardPaste,
  Copy,
  GitBranch,
  Lock,
  LockOpen,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  PanelTop,
  Redo2,
  Slash,
  Square,
  SquareArrowUpRight,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ActionType,
  OverlayMode,
  dispose,
  init,
  type Chart,
  type KLineData,
  type Overlay,
  type OverlayCreate,
  type OverlayEvent,
  type Point,
  type VisibleRange,
} from 'klinecharts';
import type { Bar } from '@tv/data-types';
import {
  KLINE_TOOL_LABELS,
  toolCreatesDrawing,
  type Drawing,
  type DrawingTool,
} from '@tv/drawing-tools';

interface KLineChartSurfaceProps {
  bars: readonly Bar[];
  drawings: readonly Drawing[];
  active?: boolean;
  live?: boolean;
  loading?: boolean;
  onDrawingsChange: (drawings: Drawing[]) => void;
  onLoadMore?: () => void;
  onBounds?: (bounds: { min: number; max: number; step: number } | null) => void;
  onCrosshairChange?: (timestamp: number | null) => void;
  replayCursor?: number | null;
}

interface DrawingHistoryEntry {
  before: Drawing[];
  after: Drawing[];
}

interface ToolMeta {
  icon: LucideIcon;
  shortcut: string;
}

const MAX_HISTORY = 80;

const TOOL_META: Record<DrawingTool, ToolMeta> = {
  cursor: { icon: MousePointer2, shortcut: 'Esc' },
  segment: { icon: Slash, shortcut: 'T' },
  line: { icon: TrendingUp, shortcut: 'T' },
  rayLine: { icon: TrendingUp, shortcut: 'R' },
  straightLine: { icon: SquareArrowUpRight, shortcut: 'E' },
  horizontalStraightLine: { icon: MoveHorizontal, shortcut: 'H' },
  verticalStraightLine: { icon: MoveVertical, shortcut: 'V' },
  rect: { icon: Square, shortcut: 'B' },
  text: { icon: Type, shortcut: 'N' },
  fibonacciLine: { icon: ChartSpline, shortcut: 'F' },
  parallelStraightLine: { icon: PanelTop, shortcut: 'P' },
  priceChannelLine: { icon: GitBranch, shortcut: 'C' },
  priceLine: { icon: BadgeCent, shortcut: 'P' },
};

const TOOL_HOTKEYS: Readonly<Record<string, DrawingTool>> = {
  t: 'segment',
  r: 'rayLine',
  e: 'straightLine',
  h: 'horizontalStraightLine',
  v: 'verticalStraightLine',
  b: 'rect',
  n: 'text',
  f: 'fibonacciLine',
  p: 'priceLine',
  c: 'priceChannelLine',
};

const toKLineData = (bar: Bar): KLineData => ({
  timestamp: bar.time * 1000,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
});

const toMode = (mode: Drawing['mode']): OverlayMode => {
  switch (mode) {
    case 'weak_magnet':
      return OverlayMode.WeakMagnet;
    case 'strong_magnet':
      return OverlayMode.StrongMagnet;
    case 'normal':
      return OverlayMode.Normal;
  }
};

const fromMode = (mode: Overlay['mode']): Drawing['mode'] => {
  switch (mode) {
    case OverlayMode.WeakMagnet:
      return 'weak_magnet';
    case OverlayMode.StrongMagnet:
      return 'strong_magnet';
    case OverlayMode.Normal:
    default:
      return 'normal';
  }
};

const snapshotDrawings = (drawings: readonly Drawing[]): Drawing[] =>
  drawings.map((drawing) => ({
    ...drawing,
    points: drawing.points.map((point) => ({ ...point })),
    ...(drawing.styles === undefined
      ? {}
      : { styles: drawing.styles === null ? null : { ...drawing.styles } }),
  }));

const drawingsEqual = (a: readonly Drawing[], b: readonly Drawing[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const freshDrawingId = (): string =>
  `kl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const overlayToDrawing = (overlay: Overlay, fallbackCreatedAt?: number): Drawing => {
  const now = Date.now();
  return {
    engine: 'klinecharts',
    id: overlay.id,
    name: overlay.name,
    groupId: overlay.groupId || undefined,
    points: overlay.points.map((point) => ({
      ...(typeof point.timestamp === 'number' ? { timestamp: point.timestamp } : {}),
      ...(typeof point.dataIndex === 'number' ? { dataIndex: point.dataIndex } : {}),
      ...(typeof point.value === 'number' ? { value: point.value } : {}),
    })),
    styles: overlay.styles ?? null,
    mode: fromMode(overlay.mode),
    lock: overlay.lock,
    visible: overlay.visible,
    zLevel: overlay.zLevel,
    extendData: overlay.extendData,
    createdAt: fallbackCreatedAt ?? now,
    updatedAt: now,
  };
};

const toKLinePoint = (point: Drawing['points'][number]): Partial<Point> => {
  const out: Partial<Point> = {};
  if (typeof point.timestamp === 'number') out.timestamp = point.timestamp;
  if (typeof point.dataIndex === 'number') out.dataIndex = point.dataIndex;
  if (typeof point.value === 'number') out.value = point.value;
  return out;
};

const drawingToOverlay = (
  drawing: Drawing,
  callbacks: Pick<
    OverlayCreate,
    | 'onDrawEnd'
    | 'onPressedMoveStart'
    | 'onPressedMoveEnd'
    | 'onRemoved'
    | 'onSelected'
    | 'onDeselected'
  >,
): OverlayCreate => {
  const overlay: OverlayCreate = {
    id: drawing.id,
    name: drawing.name,
    points: drawing.points.map(toKLinePoint),
    mode: toMode(drawing.mode),
    lock: drawing.lock,
    visible: drawing.visible,
    zLevel: drawing.zLevel,
    ...callbacks,
  };
  if (drawing.styles !== undefined) {
    overlay.styles = drawing.styles === null ? null : (drawing.styles as Exclude<OverlayCreate['styles'], undefined>);
  }
  if (drawing.groupId !== undefined) overlay.groupId = drawing.groupId;
  if (drawing.extendData !== undefined) overlay.extendData = drawing.extendData;
  return overlay;
};

const updateDrawing = (drawings: readonly Drawing[], next: Drawing): Drawing[] => {
  const index = drawings.findIndex((drawing) => drawing.id === next.id);
  if (index === -1) return [...drawings, next];
  return drawings.map((drawing, i) => (i === index ? { ...next, createdAt: drawing.createdAt } : drawing));
};

const renderBarsForReplay = (bars: readonly Bar[], replayCursor: number | null | undefined): readonly Bar[] => {
  if (replayCursor == null) return bars;
  return bars.filter((bar) => bar.time <= replayCursor);
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-ignore-chart-shortcuts="true"]')) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

const duplicateDrawing = (drawing: Drawing): Drawing => {
  const now = Date.now();
  return {
    ...drawing,
    id: freshDrawingId(),
    lock: false,
    points: drawing.points.map((point) => {
      const valueOffset = typeof point.value === 'number' ? Math.max(Math.abs(point.value) * 0.002, 0.01) : 0;
      return {
        ...point,
        ...(typeof point.dataIndex === 'number' ? { dataIndex: point.dataIndex + 2 } : {}),
        ...(typeof point.timestamp === 'number' && typeof point.dataIndex !== 'number'
          ? { timestamp: point.timestamp + 60_000 }
          : {}),
        ...(typeof point.value === 'number' ? { value: point.value + valueOffset } : {}),
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
};

export function KLineChartSurface({
  bars,
  drawings,
  active = true,
  live = true,
  loading = false,
  onDrawingsChange,
  onLoadMore,
  onBounds,
  onCrosshairChange,
  replayCursor,
}: KLineChartSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const overlayIdsRef = useRef<Set<string>>(new Set());
  const syncingOverlaysRef = useRef(false);
  const moveBeforeRef = useRef<Drawing[] | null>(null);
  const pendingDrawIdRef = useRef<string | null>(null);
  const drawingsRef = useRef<readonly Drawing[]>(drawings);
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  const onLoadMoreRef = useRef(onLoadMore);
  const onBoundsRef = useRef(onBounds);
  const onCrosshairChangeRef = useRef(onCrosshairChange);
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [magnet, setMagnet] = useState<Drawing['mode']>('weak_magnet');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Drawing | null>(null);
  const [undoStack, setUndoStack] = useState<DrawingHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingHistoryEntry[]>([]);

  drawingsRef.current = drawings;
  onDrawingsChangeRef.current = onDrawingsChange;
  onLoadMoreRef.current = onLoadMore;
  onBoundsRef.current = onBounds;
  onCrosshairChangeRef.current = onCrosshairChange;

  const selectedDrawing = drawings.find((drawing) => drawing.id === selectedId) ?? null;
  const visibleBars = useMemo(() => renderBarsForReplay(bars, replayCursor), [bars, replayCursor]);
  const klineData = useMemo(() => visibleBars.map(toKLineData), [visibleBars]);

  const commitDrawings = useCallback((nextInput: readonly Drawing[], beforeInput?: readonly Drawing[]) => {
    const before = snapshotDrawings(beforeInput ?? drawingsRef.current);
    const next = snapshotDrawings(nextInput);
    if (drawingsEqual(before, next)) return;
    setUndoStack((stack) => [...stack.slice(-(MAX_HISTORY - 1)), { before, after: next }]);
    setRedoStack([]);
    onDrawingsChangeRef.current(next);
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.at(-1);
    if (!entry) return;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((redo) => [...redo.slice(-(MAX_HISTORY - 1)), entry]);
    onDrawingsChangeRef.current(snapshotDrawings(entry.before));
    setSelectedId(null);
  }, [undoStack]);

  const redo = useCallback(() => {
    const entry = redoStack.at(-1);
    if (!entry) return;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((undoStackNext) => [...undoStackNext.slice(-(MAX_HISTORY - 1)), entry]);
    onDrawingsChangeRef.current(snapshotDrawings(entry.after));
    setSelectedId(null);
  }, [redoStack]);

  const persistOverlay = useCallback((event: OverlayEvent): boolean => {
    if (syncingOverlaysRef.current) return true;
    const overlay = event.overlay;
    const existing = drawingsRef.current.find((drawing) => drawing.id === overlay.id);
    const before = moveBeforeRef.current ?? drawingsRef.current;
    const next = updateDrawing(drawingsRef.current, overlayToDrawing(overlay, existing?.createdAt));
    moveBeforeRef.current = null;
    pendingDrawIdRef.current = null;
    overlayIdsRef.current.add(overlay.id);
    commitDrawings(next, before);
    return true;
  }, [commitDrawings]);

  const overlayCallbacks = useMemo<
    Pick<
      OverlayCreate,
      | 'onDrawEnd'
      | 'onPressedMoveStart'
      | 'onPressedMoveEnd'
      | 'onRemoved'
      | 'onSelected'
      | 'onDeselected'
    >
  >(
    () => ({
      onDrawEnd: persistOverlay,
      onPressedMoveStart: () => {
        moveBeforeRef.current = snapshotDrawings(drawingsRef.current);
        return true;
      },
      onPressedMoveEnd: persistOverlay,
      onRemoved: (event) => {
        if (syncingOverlaysRef.current) return true;
        overlayIdsRef.current.delete(event.overlay.id);
        if (pendingDrawIdRef.current === event.overlay.id) pendingDrawIdRef.current = null;
        const next = drawingsRef.current.filter((drawing) => drawing.id !== event.overlay.id);
        commitDrawings(next);
        setSelectedId((id) => (id === event.overlay.id ? null : id));
        return true;
      },
      onSelected: (event) => {
        setSelectedId(event.overlay.id);
        return true;
      },
      onDeselected: () => {
        setSelectedId(null);
        return true;
      },
    }),
    [commitDrawings, persistOverlay],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = init(host, {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      styles: {
        grid: {
          horizontal: { color: '#1f2229' },
          vertical: { color: '#1f2229' },
        },
        candle: {
          bar: {
            upColor: '#26a69a',
            downColor: '#ef5350',
            noChangeColor: '#787b86',
            upBorderColor: '#26a69a',
            downBorderColor: '#ef5350',
            noChangeBorderColor: '#787b86',
            upWickColor: '#26a69a',
            downWickColor: '#ef5350',
            noChangeWickColor: '#787b86',
          },
          priceMark: {
            high: { show: false },
            low: { show: false },
          },
        },
        xAxis: { axisLine: { color: '#2a2e39' }, tickText: { color: '#d1d4dc' } },
        yAxis: { axisLine: { color: '#2a2e39' }, tickText: { color: '#d1d4dc' } },
        separator: { color: '#2a2e39' },
        crosshair: {
          horizontal: { line: { color: '#9598a1' }, text: { backgroundColor: '#363a45' } },
          vertical: { line: { color: '#9598a1' }, text: { backgroundColor: '#363a45' } },
        },
      },
    });
    if (!chart) return;
    chartRef.current = chart;

    const onVisibleRange = (data?: unknown) => {
      const range = data as VisibleRange | undefined;
      if (!range) return;
      if (range.from <= 5) onLoadMoreRef.current?.();
    };
    const onCrosshair = (data?: unknown) => {
      const crosshair = data as { kLineData?: KLineData } | undefined;
      const timestamp = crosshair?.kLineData?.timestamp;
      onCrosshairChangeRef.current?.(typeof timestamp === 'number' ? Math.floor(timestamp / 1000) : null);
    };
    chart.subscribeAction(ActionType.OnVisibleRangeChange, onVisibleRange);
    chart.subscribeAction(ActionType.OnCrosshairChange, onCrosshair);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(host);

    return () => {
      ro.disconnect();
      chart.unsubscribeAction(ActionType.OnVisibleRangeChange, onVisibleRange);
      chart.unsubscribeAction(ActionType.OnCrosshairChange, onCrosshair);
      dispose(chart);
      chartRef.current = null;
      overlayIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    chartRef.current?.applyNewData(klineData);
  }, [klineData]);

  useEffect(() => {
    if (bars.length === 0) {
      onBoundsRef.current?.(null);
      return;
    }
    let step = Infinity;
    for (let i = 1; i < bars.length; i++) {
      const d = bars[i]!.time - bars[i - 1]!.time;
      if (d > 0 && d < step) step = d;
    }
    onBoundsRef.current?.({
      min: bars[0]!.time,
      max: bars[bars.length - 1]!.time,
      step: Number.isFinite(step) ? step : 60,
    });
  }, [bars]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncingOverlaysRef.current = true;
    try {
      for (const id of overlayIdsRef.current) chart.removeOverlay(id);
      overlayIdsRef.current.clear();
      for (const drawing of drawings) {
        const id = chart.createOverlay(drawingToOverlay(drawing, overlayCallbacks));
        if (typeof id === 'string') overlayIdsRef.current.add(id);
      }
    } finally {
      syncingOverlaysRef.current = false;
    }
    if (selectedId && !drawings.some((drawing) => drawing.id === selectedId)) setSelectedId(null);
  }, [drawings, overlayCallbacks, selectedId]);

  const focusSurface = useCallback(() => {
    surfaceRef.current?.focus({ preventScroll: true });
  }, []);

  const startTool = useCallback((nextTool: DrawingTool) => {
    focusSurface();
    setTool(nextTool);
    if (!toolCreatesDrawing(nextTool)) return;
    const chart = chartRef.current;
    if (!chart) return;
    const id = chart.createOverlay({
      name: nextTool,
      mode: toMode(magnet),
      styles: {
        line: { color: '#f5c542', size: 2 },
        polygon: { color: 'rgba(245,197,66,0.12)', borderColor: '#f5c542', borderSize: 2 },
        text: { color: '#f5c542', size: 12 },
      },
      ...overlayCallbacks,
    });
    if (typeof id === 'string') {
      pendingDrawIdRef.current = id;
      overlayIdsRef.current.add(id);
    }
  }, [focusSurface, magnet, overlayCallbacks]);

  const cancelOrCursor = useCallback(() => {
    const pendingId = pendingDrawIdRef.current;
    if (pendingId) {
      syncingOverlaysRef.current = true;
      try {
        chartRef.current?.removeOverlay(pendingId);
      } finally {
        syncingOverlaysRef.current = false;
      }
      overlayIdsRef.current.delete(pendingId);
      pendingDrawIdRef.current = null;
    }
    setTool('cursor');
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    chartRef.current?.removeOverlay(selectedId);
    setSelectedId(null);
  }, [selectedId]);

  const clearDrawings = useCallback(() => {
    if (drawingsRef.current.length === 0) return;
    syncingOverlaysRef.current = true;
    try {
      chartRef.current?.removeOverlay();
    } finally {
      syncingOverlaysRef.current = false;
    }
    overlayIdsRef.current.clear();
    commitDrawings([]);
    setSelectedId(null);
  }, [commitDrawings]);

  const copySelected = useCallback(() => {
    const drawing = drawingsRef.current.find((d) => d.id === selectedId);
    if (!drawing) return;
    setClipboard(snapshotDrawings([drawing])[0]!);
  }, [selectedId]);

  const pasteDrawing = useCallback((source: Drawing | null = clipboard) => {
    if (!source) return;
    const duplicated = duplicateDrawing(source);
    commitDrawings([...drawingsRef.current, duplicated]);
    setSelectedId(duplicated.id);
  }, [clipboard, commitDrawings]);

  const duplicateSelected = useCallback(() => {
    const drawing = drawingsRef.current.find((d) => d.id === selectedId);
    if (!drawing) return;
    const duplicated = duplicateDrawing(drawing);
    setClipboard(snapshotDrawings([drawing])[0]!);
    commitDrawings([...drawingsRef.current, duplicated]);
    setSelectedId(duplicated.id);
  }, [commitDrawings, selectedId]);

  const toggleSelectedLock = useCallback(() => {
    if (!selectedId) return;
    const next = drawingsRef.current.map((drawing) =>
      drawing.id === selectedId ? { ...drawing, lock: !drawing.lock, updatedAt: Date.now() } : drawing,
    );
    commitDrawings(next);
  }, [commitDrawings, selectedId]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'c') {
        event.preventDefault();
        copySelected();
        return;
      }
      if (mod && key === 'v') {
        event.preventDefault();
        pasteDrawing();
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelOrCursor();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        toggleSelectedLock();
        return;
      }
      const nextTool = TOOL_HOTKEYS[key];
      if (nextTool) {
        event.preventDefault();
        startTool(nextTool);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    active,
    cancelOrCursor,
    copySelected,
    duplicateSelected,
    pasteDrawing,
    redo,
    removeSelected,
    startTool,
    toggleSelectedLock,
    undo,
  ]);

  const selectedLocked = selectedDrawing?.lock ?? false;

  return (
    <div
      ref={surfaceRef}
      className={`kline-surface${active ? ' active' : ''}`}
      tabIndex={0}
      onMouseDown={focusSurface}
    >
      <div className="kline-toolbar" onMouseDown={(event) => event.stopPropagation()}>
        <div className="kline-toolbar-group">
          <button className="ghost icon" type="button" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={15} />
          </button>
          <button className="ghost icon" type="button" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)" aria-label="Redo">
            <Redo2 size={15} />
          </button>
        </div>
        <div className="kline-toolbar-group">
          {KLINE_TOOL_LABELS.map(([value, label]) => {
            const meta = TOOL_META[value];
            const Icon = meta.icon;
            return (
              <button
                key={value}
                className={tool === value ? 'primary icon' : 'ghost icon'}
                type="button"
                onClick={() => startTool(value)}
                title={`${label} (${meta.shortcut})`}
                aria-label={label}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
        <div className="kline-toolbar-group">
          <select value={magnet} onChange={(event) => setMagnet(event.target.value as Drawing['mode'])} title="Magnet mode">
            <option value="normal">free</option>
            <option value="weak_magnet">magnet</option>
            <option value="strong_magnet">strong</option>
          </select>
          <button className="ghost icon" type="button" onClick={copySelected} disabled={!selectedId} title="Copy (Ctrl+C)" aria-label="Copy selected drawing">
            <Copy size={15} />
          </button>
          <button className="ghost icon" type="button" onClick={() => pasteDrawing()} disabled={!clipboard} title="Paste (Ctrl+V)" aria-label="Paste drawing">
            <ClipboardPaste size={15} />
          </button>
          <button className="ghost icon" type="button" onClick={toggleSelectedLock} disabled={!selectedId} title="Lock/unlock (L)" aria-label="Lock selected drawing">
            {selectedLocked ? <Lock size={15} /> : <LockOpen size={15} />}
          </button>
          <button className="ghost icon" type="button" onClick={removeSelected} disabled={!selectedId} title="Delete (Del)" aria-label="Delete selected drawing">
            <Trash2 size={15} />
          </button>
          <button className="ghost" type="button" onClick={clearDrawings} disabled={drawings.length === 0} title="Clear drawings">
            Clear
          </button>
        </div>
        {!live && <span className="muted small">replay</span>}
      </div>
      <div ref={hostRef} className="kline-host" />
      {loading && <div className="chart-panel-loading muted small">loading...</div>}
    </div>
  );
}
