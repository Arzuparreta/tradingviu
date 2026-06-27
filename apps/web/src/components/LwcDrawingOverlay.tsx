import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { Drawing, DrawingTool } from '@tv/drawing-tools';
import type { Bar } from '@tv/data-types';
import { KLINE_TOOL_LABELS, toolCreatesDrawing } from '@tv/drawing-tools';

// ── Geometry helpers ──────────────────────────────────────────────────────

interface Vec2 {
  x: number;
  y: number;
}

const dist = (a: Vec2, b: Vec2): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0 || !Number.isFinite(len2)) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
};

const lineEdgeIntersection = (
  a: Vec2,
  b: Vec2,
  W: number,
  H: number,
): { from: Vec2; to: Vec2 } | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  const ts: Vec2[] = [];
  if (dx !== 0) {
    const t = -a.x / dx;
    const y = a.y + t * dy;
    if (y >= 0 && y <= H) ts.push({ x: 0, y });
    const t2 = (W - a.x) / dx;
    const y2 = a.y + t2 * dy;
    if (y2 >= 0 && y2 <= H) ts.push({ x: W, y: y2 });
  }
  if (dy !== 0) {
    const t = -a.y / dy;
    const x = a.x + t * dx;
    if (x >= 0 && x <= W) ts.push({ x, y: 0 });
    const t2 = (H - a.y) / dy;
    const x2 = a.x + t2 * dx;
    if (x2 >= 0 && x2 <= W) ts.push({ x: x2, y: H });
  }
  if (ts.length < 2) return null;
  return { from: ts[0]!, to: ts[1]! };
};

export const rayEdgeEndpoint = (a: Vec2, b: Vec2, W: number, H: number): Vec2 => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if ((dx === 0 && dy === 0) || W <= 0 || H <= 0) return b;
  const candidates: { t: number; point: Vec2 }[] = [];
  const pushCandidate = (t: number, point: Vec2) => {
    if (t <= 1e-9 || !Number.isFinite(t)) return;
    if (point.x < -1e-6 || point.x > W + 1e-6 || point.y < -1e-6 || point.y > H + 1e-6) return;
    candidates.push({
      t,
      point: {
        x: Math.max(0, Math.min(W, point.x)),
        y: Math.max(0, Math.min(H, point.y)),
      },
    });
  };
  if (dx !== 0) {
    const tLeft = -a.x / dx;
    pushCandidate(tLeft, { x: 0, y: a.y + tLeft * dy });
    const tRight = (W - a.x) / dx;
    pushCandidate(tRight, { x: W, y: a.y + tRight * dy });
  }
  if (dy !== 0) {
    const tTop = -a.y / dy;
    pushCandidate(tTop, { x: a.x + tTop * dx, y: 0 });
    const tBottom = (H - a.y) / dy;
    pushCandidate(tBottom, { x: a.x + tBottom * dx, y: H });
  }
  candidates.sort((left, right) => left.t - right.t);
  return candidates[0]?.point ?? { x: b.x + dx * 100, y: b.y + dy * 100 };
};

// ── Coordinate projection ─────────────────────────────────────────────────

const drawingPointToScreen = (
  point: Drawing['points'][number],
  chart: IChartApi,
  candleSeries: ISeriesApi<SeriesType>,
  bars: readonly Bar[],
): Vec2 | null => {
  let x: number | null = null;
  let y: number | null = null;
  if (typeof point.dataIndex === 'number') {
    const bar = bars[point.dataIndex];
    if (bar) x = chart.timeScale().timeToCoordinate(bar.time as UTCTimestamp) as number | null;
  } else if (typeof point.timestamp === 'number') {
    x = chart.timeScale().timeToCoordinate((point.timestamp / 1000) as UTCTimestamp) as number | null;
  }
  if (typeof point.value === 'number') {
    y = candleSeries.priceToCoordinate(point.value) as number | null;
  }
  if (x == null && y == null) return null;
  return { x: x ?? 0, y: y ?? 0 };
};

const drawingToScreen = (
  drawing: Drawing,
  chart: IChartApi,
  candleSeries: ISeriesApi<SeriesType>,
  bars: readonly Bar[],
): Vec2[] =>
  drawing.points
    .map((p) => drawingPointToScreen(p, chart, candleSeries, bars))
    .filter((v): v is Vec2 => v !== null);

// ── Hit testing ───────────────────────────────────────────────────────────

const HIT_THRESHOLD = 10;

const hitTestDrawing = (
  pos: Vec2,
  drawing: Drawing,
  screenPoints: Vec2[],
): boolean => {
  if (screenPoints.length === 0) return false;
  const name = drawing.name as DrawingTool;
  const [a, b] = screenPoints;
  switch (name) {
    case 'segment':
      if (screenPoints.length >= 2) return distToSegment(pos, screenPoints[0]!, screenPoints[1]!) <= HIT_THRESHOLD;
      return dist(pos, screenPoints[0]!) <= HIT_THRESHOLD;
    case 'rayLine': {
      if (screenPoints.length < 2) return dist(pos, screenPoints[0]!) <= HIT_THRESHOLD;
      const dx = b!.x - a!.x;
      const dy = b!.y - a!.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return dist(pos, a!) <= HIT_THRESHOLD;
      const dir = { x: dx / len, y: dy / len };
      const proj = (pos.x - a!.x) * dir.x + (pos.y - a!.y) * dir.y;
      const closest = { x: a!.x + proj * dir.x, y: a!.y + proj * dir.y };
      if (proj < 0) return dist(pos, a!) <= HIT_THRESHOLD;
      return dist(pos, closest) <= HIT_THRESHOLD;
    }
    case 'straightLine':
      if (screenPoints.length < 2) return dist(pos, screenPoints[0]!) <= HIT_THRESHOLD;
      return distToSegment(pos, a!, b!) <= HIT_THRESHOLD * 2;
    case 'horizontalStraightLine':
    case 'priceLine':
      return screenPoints.length >= 1 && Math.abs(pos.y - screenPoints[0]!.y) <= HIT_THRESHOLD;
    case 'verticalStraightLine':
      return screenPoints.length >= 1 && Math.abs(pos.x - screenPoints[0]!.x) <= HIT_THRESHOLD;
    case 'rect': {
      if (screenPoints.length < 2) return false;
      const x1 = Math.min(a!.x, b!.x) - HIT_THRESHOLD;
      const x2 = Math.max(a!.x, b!.x) + HIT_THRESHOLD;
      const y1 = Math.min(a!.y, b!.y) - HIT_THRESHOLD;
      const y2 = Math.max(a!.y, b!.y) + HIT_THRESHOLD;
      return pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2;
    }
    case 'fibonacciLine': {
      if (screenPoints.length < 2) return dist(pos, a!) <= HIT_THRESHOLD;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const x1 = Math.min(a!.x, b!.x);
      const x2 = Math.max(a!.x, b!.x);
      const top = a!.y;
      const bot = b!.y;
      for (const level of levels) {
        const y = top + (bot - top) * level;
        if (Math.abs(pos.y - y) <= HIT_THRESHOLD && pos.x >= x1 - HIT_THRESHOLD && pos.x <= x2 + HIT_THRESHOLD) return true;
      }
      return false;
    }
    case 'text':
      return screenPoints.length >= 1 && dist(pos, screenPoints[0]!) <= HIT_THRESHOLD * 2;
    case 'cursor':
      return false;
    default:
      if (screenPoints.length >= 2) return distToSegment(pos, screenPoints[0]!, screenPoints[1]!) <= HIT_THRESHOLD;
      return screenPoints.length >= 1 && dist(pos, screenPoints[0]!) <= HIT_THRESHOLD;
  }
};

// ── Snapshots ─────────────────────────────────────────────────────────────

const snapshotDrawings = (drawings: readonly Drawing[]): Drawing[] =>
  drawings.map((d) => ({
    ...d,
    points: d.points.map((p) => ({ ...p })),
    ...(d.styles !== undefined
      ? { styles: d.styles === null ? null : { ...(d.styles as Record<string, unknown>) } }
      : {}),
  }));

const drawingsEqual = (a: readonly Drawing[], b: readonly Drawing[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// ── Drawing creation helpers ──────────────────────────────────────────────

const freshId = (): string =>
  `lw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const pixelToPoint = (
  px: Vec2,
  chartObj: IChartApi,
  candleSeries: ISeriesApi<SeriesType>,
): Drawing['points'][number] => {
  const ts = chartObj.timeScale().coordinateToTime(px.x);
  const timeSec = typeof ts === 'number' ? ts : undefined;
  const timestamp = timeSec !== undefined && Number.isFinite(timeSec) ? Math.round(timeSec * 1000) : undefined;
  const val = candleSeries.coordinateToPrice(px.y) as number | undefined;
  return { timestamp, value: typeof val === 'number' && Number.isFinite(val) ? val : undefined };
};

const makeDrawing = (
  name: DrawingTool,
  points: Drawing['points'][number][],
  extras?: { styles?: Drawing['styles']; extendData?: Drawing['extendData']; mode?: Drawing['mode'] },
): Drawing => {
  const now = Date.now();
  return {
    engine: 'klinecharts',
    id: freshId(),
    name,
    points,
    styles: extras?.styles ?? null,
    mode: extras?.mode ?? 'normal',
    lock: false,
    visible: true,
    zLevel: 0,
    extendData: extras?.extendData,
    createdAt: now,
    updatedAt: now,
  };
};

const DEFAULT_DRAW_STYLES = {
  line: { color: '#f5c542', size: 2 },
  polygon: { color: 'rgba(245,197,66,0.12)', borderColor: '#f5c542', borderSize: 2 },
  text: { color: '#f5c542', size: 14 },
} as Drawing['styles'];

const dupDrawing = (drawing: Drawing): Drawing => {
  const id = freshId();
  return {
    ...drawing,
    id,
    lock: false,
    points: drawing.points.map((p) => {
      const base: Record<string, unknown> = { ...p };
      if (typeof p.dataIndex === 'number') {
        base.dataIndex = p.dataIndex + 2;
        // Prefer dataIndex offset; discard timestamp to avoid mixed-coordinate confusion.
        delete base.timestamp;
      } else if (typeof p.timestamp === 'number') {
        base.timestamp = p.timestamp + 60_000;
      }
      if (typeof p.value === 'number') {
        base.value = p.value + Math.max(Math.abs(p.value) * 0.002, 0.01);
      }
      return base as Drawing['points'][number];
    }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

// ── Toolbar icon map ──────────────────────────────────────────────────────

const TOOL_ICONS: Record<DrawingTool, LucideIcon> = {
  cursor: MousePointer2,
  segment: Slash,
  line: TrendingUp,
  rayLine: TrendingUp,
  straightLine: SquareArrowUpRight,
  horizontalStraightLine: MoveHorizontal,
  verticalStraightLine: MoveVertical,
  rect: Square,
  text: Type,
  fibonacciLine: ChartSpline,
  parallelStraightLine: PanelTop,
  priceChannelLine: GitBranch,
  priceLine: BadgeCent,
};

const TOOL_SHORTCUTS: Partial<Record<DrawingTool, string>> = {
  cursor: 'Esc',
  segment: 'T',
  rayLine: 'R',
  straightLine: 'E',
  horizontalStraightLine: 'H',
  verticalStraightLine: 'V',
  rect: 'B',
  text: 'N',
  fibonacciLine: 'F',
  priceChannelLine: 'C',
  priceLine: 'P',
};

const HOTKEY_MAP: Record<string, DrawingTool> = {
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

const MAX_HISTORY = 80;

// ── Component ─────────────────────────────────────────────────────────────

export interface LwcDrawingOverlayProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<SeriesType> | null;
  drawings: readonly Drawing[];
  visibleBars: readonly Bar[];
  active: boolean;
  onDrawingsChange: (drawings: Drawing[]) => void;
  onActiveChange?: (active: boolean) => void;
}

export function LwcDrawingOverlay({
  chart,
  candleSeries,
  drawings,
  visibleBars,
  active,
  onDrawingsChange,
  onActiveChange,
}: LwcDrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [mousePos, setMousePos] = useState<Vec2 | null>(null);

  // Drawing interaction state
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [magnet, setMagnet] = useState<Drawing['mode']>('normal');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Drawing | null>(null);
  const [undoStack, setUndoStack] = useState<{ before: Drawing[]; after: Drawing[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ before: Drawing[]; after: Drawing[] }[]>([]);
  const [dragging, setDragging] = useState<
    | { kind: 'create'; start: Drawing['points'][number]; current: Drawing['points'][number] }
    | { kind: 'move'; id: string; startPos: Vec2; startPoints: Drawing['points'][number][] }
    | null
  >(null);

  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  onDrawingsChangeRef.current = onDrawingsChange;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const activeRef = useRef(active);
  activeRef.current = active;
  const moveBeforeRef = useRef<Drawing[] | null>(null);

  const commit = useCallback(
    (next: Drawing[], before?: Drawing[]) => {
      const bef = snapshotDrawings(before ?? drawingsRef.current);
      const aft = snapshotDrawings(next);
      if (drawingsEqual(bef, aft)) return;
      setUndoStack((s) => [...s.slice(-(MAX_HISTORY - 1)), { before: bef, after: aft }]);
      setRedoStack([]);
      onDrawingsChangeRef.current(aft);
    },
    [],
  );

  // ── Undo / Redo ───────────────────────────────────────────────────────

  const undo = useCallback(() => {
    const entry = undoStack.at(-1);
    if (!entry) return;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((r) => [...r.slice(-(MAX_HISTORY - 1)), entry]);
    onDrawingsChangeRef.current(snapshotDrawings(entry.before));
    setSelectedId(null);
  }, [undoStack]);

  const redo = useCallback(() => {
    const entry = redoStack.at(-1);
    if (!entry) return;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((s) => [...s.slice(-(MAX_HISTORY - 1)), entry]);
    onDrawingsChangeRef.current(snapshotDrawings(entry.after));
  }, [redoStack]);

  // ── Copy / Paste / Duplicate / Delete ─────────────────────────────────

  const copySelected = useCallback(() => {
    const d = drawingsRef.current.find((x) => x.id === selectedIdRef.current);
    if (d) setClipboard(snapshotDrawings([d])[0]!);
  }, []);

  const pasteDrawing = useCallback(() => {
    if (!clipboard) return;
    const dup = dupDrawing(clipboard);
    commit([...drawingsRef.current, dup]);
    setSelectedId(dup.id);
  }, [clipboard, commit]);

  const dupeSelected = useCallback(() => {
    const d = drawingsRef.current.find((x) => x.id === selectedIdRef.current);
    if (!d) return;
    const dup = dupDrawing(d);
    setClipboard(snapshotDrawings([d])[0]!);
    commit([...drawingsRef.current, dup]);
    setSelectedId(dup.id);
  }, [commit]);

  const deleteSelected = useCallback(() => {
    if (!selectedIdRef.current) return;
    const next = drawingsRef.current.filter((d) => d.id !== selectedIdRef.current);
    commit(next);
    setSelectedId(null);
  }, [commit]);

  const toggleLock = useCallback(() => {
    if (!selectedIdRef.current) return;
    const next = drawingsRef.current.map((d) =>
      d.id === selectedIdRef.current ? { ...d, lock: !d.lock, updatedAt: Date.now() } : d,
    );
    commit(next);
  }, [commit]);

  const clearAll = useCallback(() => {
    if (drawingsRef.current.length === 0) return;
    commit([]);
    setSelectedId(null);
  }, [commit]);

  const esc = useCallback(() => {
    setDragging(null);
    if (tool === 'cursor') {
      onActiveChange?.(false);
    } else {
      setTool('cursor');
    }
    setSelectedId(null);
  }, [onActiveChange, tool]);

  // ── Resize & visible-range subscriptions ──────────────────────────────

  useEffect(() => {
    const el = svgRef.current?.parentElement?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const [, setVisibleVersion] = useState(0);
  useEffect(() => {
    if (!chart) return;
    const ts = chart.timeScale();
    const handler = () => setVisibleVersion((v) => v + 1);
    ts.subscribeVisibleTimeRangeChange(handler);
    return () => ts.unsubscribeVisibleTimeRangeChange(handler);
  }, [chart]);

  // Toggle chart container cursor
  useEffect(() => {
    const el = svgRef.current?.parentElement?.parentElement;
    if (!el) return;
    const previousCursor = el.style.cursor;
    el.style.cursor = active ? 'crosshair' : previousCursor;
    return () => {
      el.style.cursor = previousCursor;
    };
  }, [active]);

  // Reset tool to cursor when drawing mode deactivates
  useEffect(() => {
    if (!active) setTool('cursor');
  }, [active]);

  // ── Compute screen positions ──────────────────────────────────────────

  const screenDrawings = useMemo(() => {
    if (!chart || !candleSeries) return new Map<string, Vec2[]>();
    const map = new Map<string, Vec2[]>();
    for (const d of drawings) {
      map.set(d.id, drawingToScreen(d, chart, candleSeries, visibleBars));
    }
    return map;
  }, [drawings, chart, candleSeries, visibleBars]);

  // ── Hit testing ───────────────────────────────────────────────────────

  const hitTestAt = useCallback(
    (pos: Vec2): string | null => {
      if (!chart || !candleSeries) return null;
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i]!;
        if (d.lock) continue;
        const pts = screenDrawings.get(d.id) ?? [];
        if (hitTestDrawing(pos, d, pts)) return d.id;
      }
      return null;
    },
    [drawings, screenDrawings, chart, candleSeries],
  );

  // ── Mouse handlers ────────────────────────────────────────────────────

  const getMousePos = useCallback(
    (e: React.MouseEvent): Vec2 => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!chart || !candleSeries) return;
      const pos = getMousePos(e);
      if (tool === 'cursor') {
        const hit = hitTestAt(pos);
        if (hit) {
          setSelectedId(hit);
          const d = drawingsRef.current.find((x) => x.id === hit);
          if (d) {
            moveBeforeRef.current = snapshotDrawings(drawingsRef.current);
            setDragging({ kind: 'move', id: hit, startPos: pos, startPoints: d.points.map((p) => ({ ...p })) });
          }
        } else {
          setSelectedId(null);
        }
        return;
      }
      const pt = pixelToPoint(pos, chart, candleSeries);
      setDragging({ kind: 'create', start: pt, current: pt });
      setSelectedId(null);
    },
    [tool, chart, candleSeries, getMousePos, hitTestAt],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getMousePos(e);
      setMousePos(pos);
      if (!chart || !candleSeries) return;
      if (!dragging) return;
      if (dragging.kind === 'create') {
        const pt = pixelToPoint(pos, chart, candleSeries);
        setDragging({ kind: 'create', start: dragging.start, current: pt });
      } else if (dragging.kind === 'move') {
        const nowTs = chart.timeScale().coordinateToTime(pos.x);
        const startTs = chart.timeScale().coordinateToTime(dragging.startPos.x);
        const nowPrice = candleSeries.coordinateToPrice(pos.y) as number | undefined;
        const startPrice = candleSeries.coordinateToPrice(dragging.startPos.y) as number | undefined;
        const dTime = typeof nowTs === 'number' && typeof startTs === 'number' ? (nowTs - startTs) * 1000 : 0;
        const dPrice = typeof nowPrice === 'number' && typeof startPrice === 'number' ? nowPrice - startPrice : 0;
        const updated = drawingsRef.current.map((d) => {
          if (d.id !== dragging.id) return d;
          const pts = dragging.startPoints.map((sp) => {
            const p = { ...sp };
            if (typeof p.timestamp === 'number') p.timestamp += dTime;
            else if (typeof p.dataIndex === 'number' && dTime !== 0) { delete p.dataIndex; p.timestamp = (sp.timestamp ?? 0) + dTime; }
            if (typeof p.value === 'number') p.value = sp.value! + dPrice;
            return p;
          });
          return { ...d, points: pts, updatedAt: Date.now() };
        });
        onDrawingsChangeRef.current(updated);
      }
    },
    [chart, candleSeries, dragging, getMousePos],
  );

  const onMouseUp = useCallback(() => {
    if (!dragging) return;
    if (dragging.kind === 'create' && chart && candleSeries) {
      const { start, current } = dragging;
      const pointCount = (() => {
        switch (tool) {
          case 'horizontalStraightLine': case 'verticalStraightLine': case 'priceLine': case 'text': return 1;
          case 'segment': case 'rayLine': case 'straightLine': case 'rect': case 'fibonacciLine': return 2;
          default: return 2;
        }
      })();
      if (pointCount === 1) {
        let pt: Drawing['points'][number];
        if (tool === 'horizontalStraightLine' || tool === 'priceLine') pt = { value: start.value };
        else if (tool === 'verticalStraightLine') pt = { timestamp: start.timestamp };
        else pt = { ...start };
        const d = makeDrawing(tool, [pt], { styles: DEFAULT_DRAW_STYLES, mode: magnet });
        commit([...drawingsRef.current, d]);
      } else {
        const dx = (current.timestamp ?? 0) - (start.timestamp ?? 0);
        const dy = (current.value ?? 0) - (start.value ?? 0);
        if (Math.abs(dx) > 2 || Math.abs(dy) > 1) {
          const d = makeDrawing(tool, [start, current], { styles: DEFAULT_DRAW_STYLES, mode: magnet });
          commit([...drawingsRef.current, d]);
          setSelectedId(d.id);
        }
      }
    } else if (dragging.kind === 'move') {
      const before = moveBeforeRef.current;
      moveBeforeRef.current = null;
      if (before) commit(snapshotDrawings(drawingsRef.current), before);
    }
    setDragging(null);
  }, [dragging, tool, chart, candleSeries, commit, magnet]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    if (!active) return;
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); redo(); return; }
      if (mod && key === 'c') { e.preventDefault(); copySelected(); return; }
      if (mod && key === 'v') { e.preventDefault(); pasteDrawing(); return; }
      if (mod && key === 'd') { e.preventDefault(); dupeSelected(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { e.preventDefault(); esc(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (key === 'l') { e.preventDefault(); toggleLock(); return; }
      const nextTool = HOTKEY_MAP[key];
      if (nextTool) { e.preventDefault(); setTool(nextTool); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, undo, redo, copySelected, pasteDrawing, dupeSelected, esc, deleteSelected, toggleLock]);

  // ── SVG Rendering ─────────────────────────────────────────────────────

  const renderDrawing = useCallback(
    (drawing: Drawing, pts: Vec2[]) => {
      if (pts.length === 0) return null;
      const styles = drawing.styles as Record<string, unknown> | null;
      const color = (styles?.line as Record<string, unknown>)?.color as string ?? '#f5c542';
      const width = ((styles?.line as Record<string, unknown>)?.size as number) ?? 2;
      const sel = drawing.id === selectedId;
      const key = drawing.id;
      const [a, b] = pts;

      const selHandles = sel
        ? pts.map((p, i) => (
            <circle key={`h${i}`} cx={p.x} cy={p.y} r={5} fill="white" stroke={color} strokeWidth={1.5} />
          ))
        : null;

      switch (drawing.name as DrawingTool) {
        case 'segment':
          if (pts.length < 2) return null;
          return (
            <g key={key}>
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke={color} strokeWidth={width} />
              {selHandles}
            </g>
          );
        case 'rayLine': {
          if (pts.length < 2) return null;
          const endpoint = rayEdgeEndpoint(a!, b!, dims.w, dims.h);
          return (
            <g key={key}>
              <line x1={a!.x} y1={a!.y} x2={endpoint.x} y2={endpoint.y} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <line x1={a!.x} y1={a!.y} x2={endpoint.x} y2={endpoint.y} stroke={color} strokeWidth={width} />
              {selHandles}
            </g>
          );
        }
        case 'straightLine': {
          if (pts.length < 2) return null;
          const edge = lineEdgeIntersection(a!, b!, dims.w, dims.h);
          const fx = edge ? edge.from.x : a!.x - (b!.x - a!.x) * 100;
          const fy = edge ? edge.from.y : a!.y - (b!.y - a!.y) * 100;
          const tx = edge ? edge.to.x : b!.x + (b!.x - a!.x) * 100;
          const ty = edge ? edge.to.y : b!.y + (b!.y - a!.y) * 100;
          return (
            <g key={key}>
              <line x1={fx} y1={fy} x2={tx} y2={ty} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={color} strokeWidth={width} />
              {selHandles}
            </g>
          );
        }
        case 'horizontalStraightLine':
        case 'priceLine':
          if (pts.length < 1) return null;
          return (
            <g key={key}>
              <line x1={0} y1={a!.y} x2={dims.w} y2={a!.y} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <line x1={0} y1={a!.y} x2={dims.w} y2={a!.y} stroke={color} strokeWidth={width} />
              {drawing.points[0]?.value != null && (
                <text x={dims.w - 4} y={a!.y - 5} textAnchor="end" fill={color} fontSize={11} fontFamily="monospace">
                  {drawing.points[0].value.toFixed(2)}
                </text>
              )}
              {sel && <circle cx={dims.w / 2} cy={a!.y} r={5} fill="white" stroke={color} strokeWidth={1.5} />}
            </g>
          );
        case 'verticalStraightLine':
          if (pts.length < 1) return null;
          return (
            <g key={key}>
              <line x1={a!.x} y1={0} x2={a!.x} y2={dims.h} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <line x1={a!.x} y1={0} x2={a!.x} y2={dims.h} stroke={color} strokeWidth={width} />
              {sel && <circle cx={a!.x} cy={dims.h / 2} r={5} fill="white" stroke={color} strokeWidth={1.5} />}
            </g>
          );
        case 'rect': {
          if (pts.length < 2) return null;
          const x = Math.min(a!.x, b!.x);
          const y = Math.min(a!.y, b!.y);
          const w = Math.abs(b!.x - a!.x);
          const h = Math.abs(b!.y - a!.y);
          const polyStyles = styles?.polygon as Record<string, unknown> | undefined;
          const fillClr = (polyStyles?.color as string) ?? 'rgba(245,197,66,0.12)';
          const borderClr = (polyStyles?.borderColor as string) ?? color;
          const borderW = (polyStyles?.borderSize as number) ?? width;
          return (
            <g key={key}>
              <rect x={x - HIT_THRESHOLD} y={y - HIT_THRESHOLD} width={w + HIT_THRESHOLD * 2} height={h + HIT_THRESHOLD * 2} fill="transparent" />
              <rect x={x} y={y} width={w} height={h} fill={fillClr} stroke={borderClr} strokeWidth={borderW} />
              {selHandles}
            </g>
          );
        }
        case 'fibonacciLine': {
          if (pts.length < 2) return null;
          const levels = [
            { value: 0, label: '0' },
            { value: 0.236, label: '0.236' },
            { value: 0.382, label: '0.382' },
            { value: 0.5, label: '0.5' },
            { value: 0.618, label: '0.618' },
            { value: 0.786, label: '0.786' },
            { value: 1, label: '1' },
          ];
          const x1 = Math.min(a!.x, b!.x);
          const x2 = Math.max(a!.x, b!.x);
          const topPx = a!.y;
          const botPx = b!.y;
          const topPrice = drawing.points[0]?.value;
          const botPrice = drawing.points[1]?.value;
          return (
            <g key={key}>
              {levels.map((lvl) => {
                const y = topPx + (botPx - topPx) * lvl.value;
                const priceLabel =
                  topPrice != null && botPrice != null
                    ? (topPrice + (botPrice - topPrice) * lvl.value).toFixed(2)
                    : '';
                return (
                  <g key={lvl.value}>
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
                    <line
                      x1={x1} y1={y} x2={x2} y2={y}
                      stroke={color}
                      strokeWidth={lvl.value === 0 || lvl.value === 1 ? width : width * 0.7}
                      strokeDasharray={lvl.value === 0.5 ? '4 4' : undefined}
                    />
                    <text x={x1 + 4} y={y - 4} fill={color} fontSize={10} fontFamily="monospace">
                      {lvl.label} {priceLabel}
                    </text>
                  </g>
                );
              })}
              {sel && (
                <>
                  <line x1={a!.x} y1={a!.y} x2={b!.x} y2={a!.y} stroke={color} strokeWidth={1} strokeDasharray="4 4" />
                  <line x1={a!.x} y1={b!.y} x2={b!.x} y2={b!.y} stroke={color} strokeWidth={1} strokeDasharray="4 4" />
                  <circle cx={a!.x} cy={a!.y} r={5} fill="white" stroke={color} strokeWidth={1.5} />
                  <circle cx={b!.x} cy={b!.y} r={5} fill="white" stroke={color} strokeWidth={1.5} />
                </>
              )}
            </g>
          );
        }
        case 'text': {
          if (pts.length < 1) return null;
          const text = ((drawing.extendData as Record<string, unknown> | null)?.text as string) ?? 'Text';
          return (
            <g key={key}>
              {sel && (
                <rect x={a!.x} y={a!.y - 12} width={text.length * 7 + 16} height={16} fill="rgba(245,197,66,0.15)" rx={2} />
              )}
              <text x={a!.x + 4} y={a!.y} fill={color} fontSize={12} fontFamily="monospace" dominantBaseline="central">
                {text}
              </text>
              {sel && <circle cx={a!.x} cy={a!.y} r={5} fill="white" stroke={color} strokeWidth={1.5} />}
            </g>
          );
        }
        default: {
          if (pts.length < 2) return null;
          const dStr = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          return (
            <g key={key}>
              <path d={dStr} fill="none" stroke="transparent" strokeWidth={HIT_THRESHOLD * 2} />
              <path d={dStr} fill="none" stroke={color} strokeWidth={width} />
              {selHandles}
            </g>
          );
        }
      }
    },
    [dims, selectedId],
  );

  // ── Creation preview ──────────────────────────────────────────────────

  const renderCreatePreview = () => {
    if (!dragging || dragging.kind !== 'create' || !chart || !candleSeries) return null;
    const s = drawingPointToScreen(dragging.start, chart, candleSeries, visibleBars);
    const c = drawingPointToScreen(dragging.current, chart, candleSeries, visibleBars);
    if (!s) return null;
    const color = '#f5c542';
    const w = 2;
    if (!c) return <circle cx={s.x} cy={s.y} r={4} fill={color} />;
    switch (tool) {
      case 'segment': return <line x1={s.x} y1={s.y} x2={c.x} y2={c.y} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      case 'rayLine': {
        const endpoint = rayEdgeEndpoint(s, c, dims.w, dims.h);
        return <line x1={s.x} y1={s.y} x2={endpoint.x} y2={endpoint.y} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      }
      case 'straightLine': {
        const e = lineEdgeIntersection(s, c, dims.w, dims.h);
        return <line x1={e ? e.from.x : s.x - (c.x - s.x) * 10} y1={e ? e.from.y : s.y - (c.y - s.y) * 10} x2={e ? e.to.x : c.x + (c.x - s.x) * 10} y2={e ? e.to.y : c.y + (c.y - s.y) * 10} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      }
      case 'rect': {
        const x = Math.min(s.x, c.x); const y = Math.min(s.y, c.y);
        const rw = Math.abs(c.x - s.x); const rh = Math.abs(c.y - s.y);
        return <rect x={x} y={y} width={rw} height={rh} fill="rgba(245,197,66,0.08)" stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      }
      case 'fibonacciLine': {
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const x1 = Math.min(s.x, c.x); const x2 = Math.max(s.x, c.x);
        return <g>{levels.map((l) => <line key={l} x1={x1} y1={s.y + (c.y - s.y) * l} x2={x2} y2={s.y + (c.y - s.y) * l} stroke={color} strokeWidth={l === 0 || l === 1 ? w : w * 0.7} strokeDasharray="4 4" />)}</g>;
      }
      case 'horizontalStraightLine': case 'priceLine':
        return <line x1={0} y1={c.y} x2={dims.w} y2={c.y} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      case 'verticalStraightLine':
        return <line x1={c.x} y1={0} x2={c.x} y2={dims.h} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
      case 'text':
        return <><circle cx={s.x} cy={s.y} r={4} fill={color} /><text x={s.x + 8} y={s.y + 4} fill={color} fontSize={12} fontFamily="monospace">Text</text></>;
      default:
        return <line x1={s.x} y1={s.y} x2={c.x} y2={c.y} stroke={color} strokeWidth={w} strokeDasharray="6 3" />;
    }
  };

  // ── Toolbar ────────────────────────────────────────────────────────────

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const selectedLocked = selected?.lock ?? false;

  const toolbar = active ? (
    <div
      className="lwc-drawing-toolbar"
      style={{ pointerEvents: 'auto' }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="lwc-drawing-toolbar-group">
        <button className="ghost icon" type="button" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={15} />
        </button>
        <button className="ghost icon" type="button" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Redo2 size={15} />
        </button>
      </div>
      <div className="lwc-drawing-toolbar-group">
        {KLINE_TOOL_LABELS.map(([value, label]) => {
          const Icon = TOOL_ICONS[value];
          return (
            <button
              key={value}
              className={tool === value ? 'primary icon' : 'ghost icon'}
              type="button"
              onClick={() => {
                if (!activeRef.current && toolCreatesDrawing(value)) {
                  onActiveChange?.(true);
                }
                setTool(value);
              }}
              title={`${label}${TOOL_SHORTCUTS[value] ? ` (${TOOL_SHORTCUTS[value]})` : ''}`}
              aria-label={label}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
      <div className="lwc-drawing-toolbar-group">
        <select value={magnet} onChange={(e) => setMagnet(e.target.value as Drawing['mode'])} title="Magnet mode">
          <option value="normal">free</option>
          <option value="weak_magnet">magnet</option>
          <option value="strong_magnet">strong</option>
        </select>
        <button className="ghost icon" type="button" onClick={copySelected} disabled={!selectedId} title="Copy (Ctrl+C)" aria-label="Copy">
          <Copy size={15} />
        </button>
        <button className="ghost icon" type="button" onClick={() => pasteDrawing()} disabled={!clipboard} title="Paste (Ctrl+V)" aria-label="Paste">
          <ClipboardPaste size={15} />
        </button>
        <button className="ghost icon" type="button" onClick={toggleLock} disabled={!selectedId} title="Lock (L)" aria-label="Lock">
          {selectedLocked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <button className="ghost icon" type="button" onClick={deleteSelected} disabled={!selectedId} title="Delete (Del)" aria-label="Delete">
          <Trash2 size={15} />
        </button>
        <button className="ghost" type="button" onClick={clearAll} disabled={drawings.length === 0} title="Clear all">Clear</button>
      </div>
    </div>
  ) : null;

  // ── Crosshair ──────────────────────────────────────────────────────────

  const crosshair =
    mousePos && tool === 'cursor' ? (
      <>
        <line x1={0} y1={mousePos.y} x2={dims.w} y2={mousePos.y} stroke="rgba(149,152,161,0.35)" strokeWidth={1} strokeDasharray="4 4" />
        <line x1={mousePos.x} y1={0} x2={mousePos.x} y2={dims.h} stroke="rgba(149,152,161,0.35)" strokeWidth={1} strokeDasharray="4 4" />
      </>
    ) : null;

  const capturesEmptyChart = active && (tool !== 'cursor' || dragging !== null);

  return (
    <div
      data-testid="lwc-drawing-interaction-layer"
      style={{ position: 'absolute', inset: 0, pointerEvents: capturesEmptyChart ? 'auto' : 'none', zIndex: 10 }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {toolbar}
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ display: 'block', pointerEvents: capturesEmptyChart ? 'auto' : 'none' }}
      >
        {crosshair}
        {drawings.map((d) => {
          const pts = screenDrawings.get(d.id) ?? [];
          return (
            <g key={d.id} style={{ pointerEvents: active && tool === 'cursor' ? 'auto' : undefined }}>
              {renderDrawing(d, pts)}
            </g>
          );
        })}
        {renderCreatePreview()}
      </svg>
    </div>
  );
}
