import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import {
  DEFAULT_DRAWING_STYLE,
  distanceToSegment,
  isLineLike,
  lineDashFor,
  makeDrawing,
  requiredPointCount,
  toolCreatesDrawing,
  type Drawing,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingTool,
  type ScreenPoint,
} from '@tv/drawing-tools';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  drawings: readonly Drawing[];
  tool: DrawingTool;
  style: DrawingStyle;
  active: boolean;
  deleteRequest: number;
  onChange: (drawings: Drawing[]) => void;
}

interface ProjectedDrawing {
  drawing: Drawing;
  points: ScreenPoint[];
}

const timeToNumber = (time: Time | null): number | null => {
  if (typeof time === 'number') return time;
  return null;
};

const eventPoint = (
  e: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
): DrawingPoint | null => {
  const rect = svg.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const time = timeToNumber(chart.timeScale().coordinateToTime(x));
  const price = series.coordinateToPrice(y);
  if (time == null || price == null || !Number.isFinite(price)) return null;
  return { time, price };
};

const project = (chart: IChartApi, series: ISeriesApi<SeriesType>, point: DrawingPoint): ScreenPoint | null => {
  const x = chart.timeScale().timeToCoordinate(point.time as Time);
  const y = series.priceToCoordinate(point.price);
  if (x == null || y == null) return null;
  return { x, y };
};

const extendLine = (a: ScreenPoint, b: ScreenPoint, width: number, mode: 'ray' | 'extended-line'): [ScreenPoint, ScreenPoint] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0) {
    if (mode === 'ray') return [a, { x: a.x, y: b.y >= a.y ? 100000 : -100000 }];
    return [{ x: a.x, y: -100000 }, { x: a.x, y: 100000 }];
  }
  const slope = dy / dx;
  if (mode === 'ray') {
    const x = b.x >= a.x ? width : 0;
    return [a, { x, y: a.y + (x - a.x) * slope }];
  }
  return [
    { x: 0, y: a.y - a.x * slope },
    { x: width, y: a.y + (width - a.x) * slope },
  ];
};

const hitDrawing = (p: ScreenPoint, projected: readonly ProjectedDrawing[], width: number, height: number): string | null => {
  for (let i = projected.length - 1; i >= 0; i--) {
    const item = projected[i];
    if (!item) continue;
    const { drawing, points } = item;
    const threshold = 8;
    if (drawing.kind === 'horizontal-line' && Math.abs((points[0]?.y ?? -Infinity) - p.y) <= threshold) return drawing.id;
    if (drawing.kind === 'vertical-line' && Math.abs((points[0]?.x ?? -Infinity) - p.x) <= threshold) return drawing.id;
    if (drawing.kind === 'text') {
      const a = points[0];
      if (a && Math.abs(a.x - p.x) <= 48 && Math.abs(a.y - p.y) <= 18) return drawing.id;
    }
    if (drawing.kind === 'rectangle') {
      const a = points[0];
      const b = points[1];
      if (!a || !b) continue;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (p.x >= minX - threshold && p.x <= maxX + threshold && p.y >= minY - threshold && p.y <= maxY + threshold) return drawing.id;
    }
    if (isLineLike(drawing.kind)) {
      const a = points[0];
      const b = points[1];
      if (!a || !b) continue;
      const [start, end] = drawing.kind === 'trend-line' ? [a, b] : extendLine(a, b, width, drawing.kind);
      if (distanceToSegment(p, start, { x: Math.max(-1000, Math.min(width + 1000, end.x)), y: Math.max(-1000, Math.min(height + 1000, end.y)) }) <= threshold) {
        return drawing.id;
      }
    }
  }
  return null;
};

const withUpdatedDrawing = (drawings: readonly Drawing[], id: string, update: (drawing: Drawing) => Drawing): Drawing[] =>
  drawings.map((drawing) => (drawing.id === id ? update(drawing) : drawing));

export function DrawingOverlay({ chart, series, drawings, tool, style, active, deleteRequest, onChange }: DrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: Drawing['kind']; points: DrawingPoint[] } | null>(null);
  const [drag, setDrag] = useState<{ id: string; start: DrawingPoint; original: Drawing } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const readSize = () => {
      const rect = svg.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    readSize();
    const ro = new ResizeObserver(readSize);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!active || deleteRequest <= 0) return;
    const id = selectedId ?? drawings[drawings.length - 1]?.id ?? null;
    if (!id) return;
    onChange(drawings.filter((drawing) => drawing.id !== id));
    setSelectedId(null);
  }, [active, deleteRequest]);

  const projected = useMemo<ProjectedDrawing[]>(() => {
    if (!chart || !series) return [];
    return drawings
      .map((drawing) => ({ drawing, points: drawing.points.map((point) => project(chart, series, point)).filter((point): point is ScreenPoint => point !== null) }))
      .filter((item) => item.points.length > 0);
  }, [chart, drawings, series, size]);

  const updateSize = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width !== size.width || rect.height !== size.height) setSize({ width: rect.width, height: rect.height });
  };

  const commitPoint = (point: DrawingPoint) => {
    if (!toolCreatesDrawing(tool)) return;
    if (tool === 'text') {
      const text = window.prompt('Text', '');
      if (!text) return;
      onChange([...drawings, makeDrawing(tool, [point], style, text)]);
      return;
    }
    const nextPoints = draft?.kind === tool ? [...draft.points, point] : [point];
    if (nextPoints.length >= requiredPointCount(tool)) {
      onChange([...drawings, makeDrawing(tool, nextPoints, style)]);
      setDraft(null);
    } else {
      setDraft({ kind: tool, points: nextPoints });
    }
  };

  const pointerScreenPoint = (e: React.PointerEvent<SVGSVGElement>): ScreenPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active || !chart || !series || !svgRef.current) return;
    updateSize();
    const point = eventPoint(e, svgRef.current, chart, series);
    if (!point) return;
    if (toolCreatesDrawing(tool)) {
      e.preventDefault();
      commitPoint(point);
      return;
    }
    if (tool === 'select') {
      const screen = pointerScreenPoint(e);
      if (!screen) return;
      const id = hitDrawing(screen, projected, size.width, size.height);
      setSelectedId(id);
      const drawing = drawings.find((d) => d.id === id);
      if (drawing) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ id: drawing.id, start: point, original: drawing });
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!chart || !series || !svgRef.current || !drag) return;
    const point = eventPoint(e, svgRef.current, chart, series);
    if (!point) return;
    const dt = point.time - drag.start.time;
    const dp = point.price - drag.start.price;
    onChange(
      withUpdatedDrawing(drawings, drag.id, (drawing) => ({
        ...drawing,
        points: drag.original.points.map((p) => ({ time: p.time + dt, price: p.price + dp })),
        updatedAt: Date.now(),
      })),
    );
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        void 0;
      }
      setDrag(null);
    }
  };

  const selected = selectedId ? drawings.find((drawing) => drawing.id === selectedId) : null;
  const pointerEvents = active && tool !== 'cursor' ? 'auto' : 'none';

  return (
    <svg
      ref={svgRef}
      className="drawing-overlay"
      style={{ pointerEvents }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-hidden
    >
      {projected.map(({ drawing, points }) => (
        <DrawingShape key={drawing.id} drawing={drawing} points={points} width={size.width} height={size.height} selected={drawing.id === selectedId} />
      ))}
      {draft && chart && series && draft.points.map((point, i) => {
        const p = project(chart, series, point);
        return p ? <circle key={i} cx={p.x} cy={p.y} r={4} fill={style.color} /> : null;
      })}
      {selected && <title>{selected.kind}</title>}
    </svg>
  );
}

function DrawingShape({ drawing, points, width, height, selected }: { drawing: Drawing; points: ScreenPoint[]; width: number; height: number; selected: boolean }) {
  const stroke = drawing.style.color;
  const strokeWidth = drawing.style.width;
  const dash = lineDashFor(drawing.style);
  const selection = selected ? <g>{points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#2962ff" stroke="#fff" strokeWidth={1} />)}</g> : null;

  if (drawing.kind === 'horizontal-line') {
    const y = points[0]?.y;
    if (y == null) return null;
    return <g><line x1={0} x2={width} y1={y} y2={y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />{selection}</g>;
  }
  if (drawing.kind === 'vertical-line') {
    const x = points[0]?.x;
    if (x == null) return null;
    return <g><line x1={x} x2={x} y1={0} y2={height} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />{selection}</g>;
  }
  if (drawing.kind === 'rectangle') {
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return (
      <g>
        <rect x={x} y={y} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill={drawing.style.fillColor ?? `${stroke}22`} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
        {selection}
      </g>
    );
  }
  if (drawing.kind === 'text') {
    const p = points[0];
    if (!p) return null;
    return (
      <g>
        <text x={p.x} y={p.y} fill={drawing.style.textColor ?? stroke} fontSize={13} fontFamily="inherit">{drawing.text ?? ''}</text>
        {selection}
      </g>
    );
  }
  const a = points[0];
  const b = points[1];
  if (!a || !b) return null;
  const [start, end] = drawing.kind === 'trend-line' ? [a, b] : extendLineForRender(a, b, width, drawing.kind);
  return <g><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />{selection}</g>;
}

const extendLineForRender = (a: ScreenPoint, b: ScreenPoint, width: number, mode: 'ray' | 'extended-line'): [ScreenPoint, ScreenPoint] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0) {
    if (mode === 'ray') return [a, { x: a.x, y: b.y >= a.y ? 100000 : -100000 }];
    return [{ x: a.x, y: -100000 }, { x: a.x, y: 100000 }];
  }
  const slope = dy / dx;
  if (mode === 'ray') {
    const x = b.x >= a.x ? width : 0;
    return [a, { x, y: a.y + (x - a.x) * slope }];
  }
  return [
    { x: 0, y: a.y - a.x * slope },
    { x: width, y: a.y + (width - a.x) * slope },
  ];
};
