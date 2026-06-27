import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BadgeCent,
  BadgeDollarSign,
  CalendarDays,
  ChartSpline,
  ChartNoAxesCombined,
  Circle,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Flag,
  GitBranch,
  Highlighter,
  Layers3,
  Lock,
  LockOpen,
  MapPin,
  MessageSquare,
  Milestone,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  NotebookText,
  PanelTop,
  PenLine,
  Redo2,
  Rows3,
  Ruler,
  Save,
  Slash,
  Spline,
  Square,
  SquareArrowUpRight,
  Star,
  Table2,
  Trash2,
  TrendingUp,
  Triangle,
  Type,
  Undo2,
  Waypoints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DrawingTool } from '@tv/drawing-tools';
import { KLINE_TOOL_GROUPS, KLINE_TOOL_LABELS } from '@tv/drawing-tools';
import type { DrawingManager } from '@tv/drawing-tools';
import type { Drawing } from '@tv/drawing-tools';
import type { DrawingStylePatch } from '../hooks/use-drawing-manager';

// ── Icon map ────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, LucideIcon> = {
  cursor: MousePointer2,
  segment: Slash,
  line: TrendingUp,
  rayLine: TrendingUp,
  straightLine: SquareArrowUpRight,
  horizontalRayLine: MoveHorizontal,
  horizontalStraightLine: MoveHorizontal,
  verticalStraightLine: MoveVertical,
  crossLine: Spline,
  infoLine: Ruler,
  trendAngle: ChartSpline,
  arrow: ArrowUp,
  rect: Square,
  circle: Circle,
  triangle: Triangle,
  ellipse: Circle,
  arc: ChartSpline,
  rotatedRectangle: SquareArrowUpRight,
  path: PenLine,
  polyline: Waypoints,
  curve: Spline,
  doubleCurve: Spline,
  text: Type,
  callout: MessageSquare,
  anchoredText: Type,
  note: NotebookText,
  priceNote: BadgeCent,
  priceLabel: BadgeCent,
  flag: Flag,
  pin: MapPin,
  comment: MessageSquare,
  signpost: Milestone,
  table: Table2,
  fibonacciLine: ChartSpline,
  fibExtension: ChartSpline,
  fibChannel: ChartSpline,
  fibTimeZone: CalendarDays,
  fibSpeedFan: ChartSpline,
  fibTimeExtension: CalendarDays,
  fibCircles: Circle,
  fibSpiral: Spline,
  fibArcs: ChartSpline,
  fibWedge: ChartSpline,
  pitchfan: ChartSpline,
  parallelStraightLine: PanelTop,
  priceChannelLine: GitBranch,
  regressionTrend: ChartNoAxesCombined,
  flatTopBottom: PanelTop,
  disjointChannel: GitBranch,
  priceLine: BadgeCent,
  priceRange: Ruler,
  dateRange: CalendarDays,
  datePriceRange: Ruler,
  projection: Milestone,
  forecast: ChartNoAxesCombined,
  barsPattern: Rows3,
  longPosition: BadgeDollarSign,
  shortPosition: BadgeDollarSign,
  andrewsPitchfork: GitBranch,
  schiffPitchfork: GitBranch,
  modifiedSchiffPitchfork: GitBranch,
  insidePitchfork: GitBranch,
  gannBox: Square,
  gannFan: ChartSpline,
  gannSquareFixed: Square,
  gannSquare: Square,
  brush: PenLine,
  highlighter: Highlighter,
  arrowMarker: ArrowUp,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
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

const TOOL_LABELS = new Map<string, string>(KLINE_TOOL_LABELS.map(([tool, label]) => [tool, label]));
const FAVORITE_TOOLS_KEY = 'tv.drawing.favoriteTools';
const STYLE_TEMPLATES_KEY = 'tv.drawing.styleTemplates';

interface StyleTemplate {
  readonly id: string;
  readonly name: string;
  readonly style: DrawingStylePatch;
}

const readJsonArray = <T,>(key: string): T[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const writeJsonArray = <T,>(key: string, value: readonly T[]): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};

const drawingDisplayName = (drawing: Drawing): string => {
  const extendData = drawing.extendData;
  if (extendData && typeof extendData === 'object' && !Array.isArray(extendData)) {
    const label = (extendData as Record<string, unknown>).label;
    if (typeof label === 'string' && label.trim().length > 0) return label.trim();
  }
  return TOOL_LABELS.get(drawing.name) ?? drawing.name;
};

const drawingStyleValue = (
  drawing: Drawing | null,
  section: 'line' | 'polygon' | 'text',
  key: string,
  fallback: string | number,
): string | number => {
  const styles = drawing?.styles;
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return fallback;
  const branch = (styles as Record<string, unknown>)[section];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return fallback;
  const value = (branch as Record<string, unknown>)[key];
  return typeof value === typeof fallback ? value as string | number : fallback;
};

const colorInputValue = (value: string, fallback: string): string =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

// ── Props ───────────────────────────────────────────────────────────────

export interface DrawingToolbarProps {
  manager: DrawingManager | null;
  drawings: readonly Drawing[];
  activeTool: string | null;
  selectedId: string | null;
  isPlacing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onStartTool: (toolName: string) => void;
  onCancelPlacement: () => void;
  onSelectDrawing: (id: string | null) => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onToggleLock: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onRenameDrawing: (id: string, label: string) => void;
  onUpdateStyle: (id: string, patch: DrawingStylePatch) => void;
  onDuplicateDrawing: (id: string) => void;
  onCopyDrawing: (id: string) => void;
  onPasteDrawing: () => void;
  onMoveDrawing: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onSetDrawingGroup: (id: string, groupId: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
}

// ── Component ───────────────────────────────────────────────────────────

export function DrawingToolbar({
  manager,
  drawings,
  activeTool,
  selectedId,
  isPlacing,
  canUndo,
  canRedo,
  onStartTool,
  onCancelPlacement,
  onSelectDrawing,
  onRemoveSelected,
  onClearAll,
  onToggleLock,
  onToggleVisibility,
  onRenameDrawing,
  onUpdateStyle,
  onDuplicateDrawing,
  onCopyDrawing,
  onPasteDrawing,
  onMoveDrawing,
  onSetDrawingGroup,
  onUndo,
  onRedo,
}: DrawingToolbarProps) {
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [favoriteTools, setFavoriteTools] = useState<DrawingTool[]>(() => readJsonArray<DrawingTool>(FAVORITE_TOOLS_KEY));
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>(() => readJsonArray<StyleTemplate>(STYLE_TEMPLATES_KEY));
  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const selectedLocked = selected?.lock ?? false;
  const selectedVisible = selected?.visible !== false;
  const orderedDrawings = useMemo(
    () => [...drawings].sort((a, b) => (b.zLevel ?? 0) - (a.zLevel ?? 0)),
    [drawings],
  );
  const selectedLineColor = colorInputValue(String(drawingStyleValue(selected, 'line', 'color', '#f5c542')), '#f5c542');
  const selectedFillColor = colorInputValue(String(drawingStyleValue(selected, 'polygon', 'color', '#332817')), '#332817');
  const selectedTextColor = colorInputValue(String(drawingStyleValue(selected, 'text', 'color', selectedLineColor)), selectedLineColor);
  const selectedLineWidth = Number(drawingStyleValue(selected, 'line', 'size', 2));
  const selectedLineStyle = String(drawingStyleValue(selected, 'line', 'style', 'solid'));
  const canFavoriteActiveTool = activeTool !== null && activeTool !== 'cursor';
  const activeToolFavorite = canFavoriteActiveTool && favoriteTools.includes(activeTool as DrawingTool);
  const favoriteToolEntries = KLINE_TOOL_LABELS.filter(([tool]) => favoriteTools.includes(tool));

  const toggleFavoriteActiveTool = () => {
    if (!canFavoriteActiveTool) return;
    const tool = activeTool as DrawingTool;
    setFavoriteTools((current) => {
      const next = current.includes(tool)
        ? current.filter((item) => item !== tool)
        : [...current, tool];
      writeJsonArray(FAVORITE_TOOLS_KEY, next);
      return next;
    });
  };

  const saveSelectedStyleTemplate = () => {
    if (!selected) return;
    const template: StyleTemplate = {
      id: `tpl_${Date.now().toString(36)}`,
      name: `Style ${styleTemplates.length + 1}`,
      style: {
        lineColor: selectedLineColor,
        fillColor: selectedFillColor,
        textColor: selectedTextColor,
        lineWidth: selectedLineWidth,
        lineStyle: selectedLineStyle === 'dashed' ? 'dashed' : 'solid',
      },
    };
    setStyleTemplates((current) => {
      const next = [...current.slice(-11), template];
      writeJsonArray(STYLE_TEMPLATES_KEY, next);
      return next;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === 'y') { e.preventDefault(); onRedo(); return; }
      if (mod && key === 'c' && selectedId) { e.preventDefault(); onCopyDrawing(selectedId); return; }
      if (mod && key === 'v') { e.preventDefault(); onPasteDrawing(); return; }
      if (mod && key === 'd' && selectedId) { e.preventDefault(); onDuplicateDrawing(selectedId); return; }

      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { e.preventDefault(); onCancelPlacement(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onRemoveSelected(); return; }
      if (e.key.toLowerCase() === 'l' && selectedId) { e.preventDefault(); onToggleLock(selectedId); return; }

      const nextTool = HOTKEY_MAP[key];
      if (nextTool) { e.preventDefault(); onStartTool(nextTool); }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    onUndo,
    onRedo,
    onCancelPlacement,
    onRemoveSelected,
    onToggleLock,
    onCopyDrawing,
    onPasteDrawing,
    onDuplicateDrawing,
    onStartTool,
    selectedId,
  ]);

  return (
    <Fragment>
      <div
        className="lwc-drawing-toolbar"
        style={{ pointerEvents: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="lwc-drawing-toolbar-group">
          <button
            className="ghost icon" type="button"
            onClick={onUndo} disabled={!canUndo}
            title="Undo (Ctrl+Z)" aria-label="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            className="ghost icon" type="button"
            onClick={onRedo} disabled={!canRedo}
            title="Redo (Ctrl+Y)" aria-label="Redo"
          >
            <Redo2 size={15} />
          </button>
          <button
            className={objectsOpen ? 'primary icon' : 'ghost icon'} type="button"
            onClick={() => setObjectsOpen((open) => !open)}
            title="Objects" aria-label="Objects"
          >
            <Layers3 size={15} />
          </button>
          <button
            className={activeToolFavorite ? 'primary icon' : 'ghost icon'} type="button"
            onClick={toggleFavoriteActiveTool}
            disabled={!canFavoriteActiveTool}
            title="Favorite tool" aria-label="Favorite tool"
          >
            <Star size={15} />
          </button>
        </div>

        {favoriteToolEntries.length > 0 && (
          <div className="lwc-drawing-toolbar-group" aria-label="Favorite tools">
            {favoriteToolEntries.map(([value, label]) => {
              const Icon = TOOL_ICONS[value] ?? MousePointer2;
              const isActive = activeTool === value;
              return (
                <button
                  key={value}
                  className={isActive ? 'primary icon' : 'ghost icon'}
                  type="button"
                  onClick={() => onStartTool(value)}
                  title={label}
                  aria-label={label}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        )}

        {KLINE_TOOL_GROUPS.map((group) => (
          <div className="lwc-drawing-toolbar-group" key={group.id} aria-label={group.label}>
            {group.tools.map(([value, label]) => {
              const Icon = TOOL_ICONS[value] ?? MousePointer2;
              const isActive = value === 'cursor' ? !activeTool : activeTool === value;
              return (
                <button
                  key={value}
                  className={isActive ? 'primary icon' : 'ghost icon'}
                  type="button"
                  onClick={() => {
                    if (value === 'cursor') {
                      onCancelPlacement();
                    } else {
                      onStartTool(value);
                    }
                  }}
                  title={`${label}${TOOL_SHORTCUTS[value] ? ` (${TOOL_SHORTCUTS[value]})` : ''}`}
                  aria-label={label}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        ))}

        <div className="lwc-drawing-toolbar-group">
          <button
            className="ghost icon" type="button"
            onClick={() => selectedId && onToggleVisibility(selectedId)}
            disabled={!selectedId}
            title="Hide / show" aria-label="Hide / show"
          >
            {selectedVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            className="ghost icon" type="button"
            onClick={() => selectedId && onToggleLock(selectedId)}
            disabled={!selectedId}
            title="Lock (L)" aria-label="Lock"
          >
            {selectedLocked ? <Lock size={15} /> : <LockOpen size={15} />}
          </button>
          <button
            className="ghost icon" type="button"
            onClick={() => selectedId && onDuplicateDrawing(selectedId)}
            disabled={!selectedId}
            title="Duplicate (Ctrl+D)" aria-label="Duplicate"
          >
            <Copy size={15} />
          </button>
          <button
            className="ghost icon" type="button"
            onClick={onPasteDrawing}
            title="Paste (Ctrl+V)" aria-label="Paste"
          >
            <Clipboard size={15} />
          </button>
          <button
            className="ghost icon" type="button"
            onClick={onRemoveSelected}
            disabled={!selectedId}
            title="Delete (Del)" aria-label="Delete"
          >
            <Trash2 size={15} />
          </button>
          <button
            className="ghost" type="button"
            onClick={onClearAll}
            disabled={drawings.length === 0}
            title="Clear all"
          >
            Clear
          </button>
        </div>
      </div>

      {objectsOpen && (
        <div
          className="lwc-drawing-objects"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="lwc-drawing-objects-head">
            <span>Objects</span>
            <span className="muted mono">{drawings.length}</span>
          </div>
          <div className="lwc-drawing-object-list">
            {orderedDrawings.map((drawing) => {
              const active = drawing.id === selectedId;
              const Icon = TOOL_ICONS[drawing.name] ?? PenLine;
              return (
                <button
                  key={drawing.id}
                  className={active ? 'lwc-drawing-object-row active' : 'lwc-drawing-object-row'}
                  type="button"
                  onClick={() => onSelectDrawing(drawing.id)}
                  title={drawingDisplayName(drawing)}
                >
                  <Icon size={14} />
                  <span>{drawingDisplayName(drawing)}</span>
                  {drawing.groupId && <span className="lwc-drawing-object-tag">{drawing.groupId}</span>}
                  {drawing.visible === false && <EyeOff size={13} />}
                  {drawing.lock && <Lock size={13} />}
                </button>
              );
            })}
            {orderedDrawings.length === 0 && <div className="lwc-drawing-object-empty">No drawings</div>}
          </div>

          {selected && (
            <div className="lwc-drawing-inspector">
              <input
                key={`label-${selected.id}`}
                defaultValue={drawingDisplayName(selected)}
                aria-label="Object name"
                onBlur={(e) => onRenameDrawing(selected.id, e.currentTarget.value)}
              />
              <div className="lwc-drawing-inspector-actions">
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'top')} title="Bring to front" aria-label="Bring to front"><ArrowUp size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'up')} title="Forward" aria-label="Forward"><ArrowUp size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'down')} title="Backward" aria-label="Backward"><ArrowDown size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'bottom')} title="Send to back" aria-label="Send to back"><ArrowDown size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onCopyDrawing(selected.id)} title="Copy" aria-label="Copy"><Copy size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onToggleVisibility(selected.id)} title="Hide / show" aria-label="Hide / show">{selectedVisible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button className="ghost icon" type="button" onClick={() => onToggleLock(selected.id)} title="Lock" aria-label="Lock">{selectedLocked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
              </div>
              <div className="lwc-drawing-style-grid">
                <input aria-label="Line color" type="color" value={selectedLineColor} onChange={(e) => onUpdateStyle(selected.id, { lineColor: e.currentTarget.value, textColor: e.currentTarget.value })} />
                <input aria-label="Fill color" type="color" value={selectedFillColor} onChange={(e) => onUpdateStyle(selected.id, { fillColor: e.currentTarget.value })} />
                <input aria-label="Text color" type="color" value={selectedTextColor} onChange={(e) => onUpdateStyle(selected.id, { textColor: e.currentTarget.value })} />
                <input aria-label="Line width" type="number" min={1} max={8} value={selectedLineWidth} onChange={(e) => onUpdateStyle(selected.id, { lineWidth: Number(e.currentTarget.value) })} />
                <select aria-label="Line style" value={selectedLineStyle} onChange={(e) => onUpdateStyle(selected.id, { lineStyle: e.currentTarget.value === 'dashed' ? 'dashed' : 'solid' })}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </div>
              <div className="lwc-drawing-template-row">
                <button className="ghost icon" type="button" onClick={saveSelectedStyleTemplate} title="Save style" aria-label="Save style">
                  <Save size={14} />
                </button>
                <select
                  aria-label="Apply style"
                  value=""
                  onChange={(e) => {
                    const template = styleTemplates.find((item) => item.id === e.currentTarget.value);
                    if (template) onUpdateStyle(selected.id, template.style);
                  }}
                >
                  <option value="">Style</option>
                  {styleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </div>
              <input
                key={`group-${selected.id}`}
                defaultValue={selected.groupId ?? ''}
                aria-label="Group"
                placeholder="Group"
                onBlur={(e) => onSetDrawingGroup(selected.id, e.currentTarget.value || null)}
              />
            </div>
          )}
        </div>
      )}
    </Fragment>
  );
}
