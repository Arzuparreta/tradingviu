import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
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
  Search,
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
import { KLINE_TOOL_GROUPS, KLINE_TOOL_LABELS, toolSupportsText } from '@tv/drawing-tools';
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
const RECENT_TOOLS_KEY = 'tv.drawing.recentTools';
const STYLE_TEMPLATES_KEY = 'tv.drawing.styleTemplates';
const MAX_RECENT_TOOLS = 8;

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

const drawingTextValue = (drawing: Drawing): string => {
  const extendData = drawing.extendData;
  if (extendData && typeof extendData === 'object' && !Array.isArray(extendData)) {
    const text = (extendData as Record<string, unknown>).text;
    if (typeof text === 'string') return text;
  }
  return '';
};

type SyncModeValue = 'scope' | 'symbol' | 'global';
type IntervalVisibilityMode = 'all' | 'only' | 'except';

const drawingExtend = (drawing: Drawing): Record<string, unknown> => {
  const extendData = drawing.extendData;
  return extendData && typeof extendData === 'object' && !Array.isArray(extendData)
    ? (extendData as Record<string, unknown>)
    : {};
};

const drawingSyncMode = (drawing: Drawing): SyncModeValue => {
  const mode = drawingExtend(drawing).syncMode;
  return mode === 'symbol' || mode === 'global' ? mode : 'scope';
};

const drawingVisibility = (drawing: Drawing): { mode: IntervalVisibilityMode; intervals: string[] } => {
  const visibility = drawingExtend(drawing).visibility;
  if (visibility && typeof visibility === 'object' && !Array.isArray(visibility)) {
    const vis = visibility as { mode?: unknown; intervals?: unknown };
    const mode: IntervalVisibilityMode = vis.mode === 'only' || vis.mode === 'except' ? vis.mode : 'all';
    const intervals = Array.isArray(vis.intervals)
      ? vis.intervals.filter((value): value is string => typeof value === 'string')
      : [];
    return { mode, intervals };
  }
  return { mode: 'all', intervals: [] };
};

const intervalsFromText = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const ALERT_OPERATORS: readonly (readonly [string, string])[] = [
  ['crosses_above', 'Crosses up'],
  ['crosses_below', 'Crosses down'],
  ['above', 'Above'],
  ['below', 'Below'],
];
const ALERT_TARGETS: readonly (readonly [string, string])[] = [
  ['line', 'Line'],
  ['upper', 'Upper'],
  ['lower', 'Lower'],
];

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

const toolGroupIcon = (groupId: string): LucideIcon => {
  switch (groupId) {
    case 'lines':
      return TrendingUp;
    case 'channels':
      return GitBranch;
    case 'fibonacci':
      return ChartSpline;
    case 'pitchfork-gann':
      return SquareArrowUpRight;
    case 'measure':
      return Ruler;
    case 'shapes':
      return Square;
    case 'annotations':
      return Type;
    default:
      return PenLine;
  }
};

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
  onSetDrawingText: (id: string, text: string) => void;
  onUpdateStyle: (id: string, patch: DrawingStylePatch) => void;
  onDuplicateDrawing: (id: string) => void;
  onCopyDrawing: (id: string) => void;
  onPasteDrawing: () => void;
  onMoveDrawing: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onSetDrawingGroup: (id: string, groupId: string | null) => void;
  onSetSyncMode: (id: string, mode: 'scope' | 'symbol' | 'global') => void;
  onSetIntervalVisibility: (id: string, mode: 'all' | 'only' | 'except', intervals: string[]) => void;
  onAddAlert?: (id: string, operator: string, target: string) => void;
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
  onSetDrawingText,
  onUpdateStyle,
  onDuplicateDrawing,
  onCopyDrawing,
  onPasteDrawing,
  onMoveDrawing,
  onSetDrawingGroup,
  onSetSyncMode,
  onSetIntervalVisibility,
  onAddAlert,
  onUndo,
  onRedo,
}: DrawingToolbarProps) {
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState('');
  const [recentTools, setRecentTools] = useState<DrawingTool[]>(() => readJsonArray<DrawingTool>(RECENT_TOOLS_KEY));
  const [favoriteTools, setFavoriteTools] = useState<DrawingTool[]>(() => readJsonArray<DrawingTool>(FAVORITE_TOOLS_KEY));
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>(() => readJsonArray<StyleTemplate>(STYLE_TEMPLATES_KEY));
  const [magnetMode, setMagnetMode] = useState(false);
  const [stayMode, setStayMode] = useState(false);
  const [objectSyncMode, setObjectSyncMode] = useState<SyncModeValue>('scope');
  const [intervalMode, setIntervalMode] = useState<IntervalVisibilityMode>('all');
  const [intervalText, setIntervalText] = useState('');
  const [alertOperator, setAlertOperator] = useState('crosses_above');
  const [alertTarget, setAlertTarget] = useState('line');
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
  const recentToolEntries = KLINE_TOOL_LABELS.filter(([tool]) => recentTools.includes(tool));
  const openGroup = KLINE_TOOL_GROUPS.find((group) => group.id === openGroupId) ?? null;
  const flyoutTools = (openGroup?.tools ?? []).filter(([, label]) => {
    const q = toolQuery.trim().toLowerCase();
    return q.length === 0 || label.toLowerCase().includes(q);
  });
  const quickTools = [...favoriteToolEntries, ...recentToolEntries.filter(([tool]) => !favoriteTools.includes(tool))].slice(0, 10);

  // Sync the editable sync/visibility controls when the selection changes.
  useEffect(() => {
    if (!selected) return;
    setObjectSyncMode(drawingSyncMode(selected));
    const visibility = drawingVisibility(selected);
    setIntervalMode(visibility.mode);
    setIntervalText(visibility.intervals.join(', '));
    // Only re-sync on selection change, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const rememberRecentTool = (tool: DrawingTool) => {
    if (tool === 'cursor') return;
    setRecentTools((current) => {
      const next = [tool, ...current.filter((item) => item !== tool)].slice(0, MAX_RECENT_TOOLS);
      writeJsonArray(RECENT_TOOLS_KEY, next);
      return next;
    });
  };

  const startDockTool = (tool: DrawingTool) => {
    if (tool === 'cursor') {
      onCancelPlacement();
      setOpenGroupId(null);
      return;
    }
    rememberRecentTool(tool);
    onStartTool(tool);
    setOpenGroupId(null);
    setObjectsOpen(false);
  };

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

  const toggleMagnetMode = () => {
    const next = !magnetMode;
    setMagnetMode(next);
    manager?.setMagnetMode?.(next ? 'strong' : 'off');
  };

  const toggleStayMode = () => {
    const next = !stayMode;
    setStayMode(next);
    manager?.setStayInDrawingMode?.(next);
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
        className="lwc-drawing-toolbar lwc-drawing-dock"
        style={{ pointerEvents: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="lwc-drawing-toolbar-group">
          <button
            className={!activeTool ? 'primary icon' : 'ghost icon'}
            type="button"
            onClick={() => startDockTool('cursor')}
            title="Cursor (Esc)"
            aria-label="Cursor"
          >
            <MousePointer2 size={15} />
          </button>
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
            onClick={() => {
              setObjectsOpen((open) => !open);
              setOpenGroupId(null);
            }}
            title="Objects" aria-label="Objects"
          >
            <Layers3 size={15} />
          </button>
          <button
            className={magnetMode ? 'primary icon' : 'ghost icon'} type="button"
            onClick={toggleMagnetMode}
            title="Magnet mode" aria-label="Magnet mode"
          >
            <MoveVertical size={15} />
          </button>
          <button
            className={stayMode ? 'primary icon' : 'ghost icon'} type="button"
            onClick={toggleStayMode}
            title="Stay in drawing mode" aria-label="Stay in drawing mode"
          >
            <PenLine size={15} />
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

        {quickTools.length > 0 && (
          <div className="lwc-drawing-toolbar-group" aria-label="Favorite and recent tools">
            {quickTools.map(([value, label]) => {
              const Icon = TOOL_ICONS[value] ?? MousePointer2;
              const isActive = activeTool === value;
              return (
                <button
                  key={value}
                  className={isActive ? 'primary icon' : 'ghost icon'}
                  type="button"
                  onClick={() => startDockTool(value)}
                  title={label}
                  aria-label={label}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        )}

        <div className="lwc-drawing-toolbar-group" aria-label="Tool categories">
          {KLINE_TOOL_GROUPS.filter((group) => group.id !== 'cursor').map((group) => {
            const Icon = toolGroupIcon(group.id);
            const groupActive = group.tools.some(([value]) => activeTool === value);
            return (
              <button
                key={group.id}
                className={openGroupId === group.id || groupActive ? 'primary icon' : 'ghost icon'}
                type="button"
                onClick={() => {
                  setOpenGroupId((current) => current === group.id ? null : group.id);
                  setObjectsOpen(false);
                  setToolQuery('');
                }}
                title={group.label}
                aria-label={group.label}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>

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

      {openGroup && (
        <div
          className="lwc-drawing-dock-flyout"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <div className="lwc-drawing-dock-flyout-head">
            <span>{openGroup.label}</span>
            <span className="muted mono">{flyoutTools.length}</span>
          </div>
          <label className="lwc-drawing-tool-search">
            <Search size={13} />
            <input
              value={toolQuery}
              onChange={(e) => setToolQuery(e.currentTarget.value)}
              placeholder="Search"
              aria-label="Search drawing tools"
            />
          </label>
          <div className="lwc-drawing-tool-list">
            {flyoutTools.map(([value, label]) => {
              const Icon = TOOL_ICONS[value] ?? MousePointer2;
              const isActive = activeTool === value;
              return (
                <button
                  key={value}
                  className={isActive ? 'lwc-drawing-tool-row active' : 'lwc-drawing-tool-row'}
                  type="button"
                  onClick={() => startDockTool(value)}
                  title={label}
                  aria-label={label}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {TOOL_SHORTCUTS[value] && <span className="mono muted">{TOOL_SHORTCUTS[value]}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
              {toolSupportsText(selected.name) && (
                <textarea
                  key={`text-${selected.id}`}
                  className="lwc-drawing-text-input"
                  defaultValue={drawingTextValue(selected)}
                  aria-label="Text content"
                  placeholder="Text"
                  rows={2}
                  onBlur={(e) => onSetDrawingText(selected.id, e.currentTarget.value)}
                />
              )}
              <div className="lwc-drawing-inspector-actions">
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'top')} title="Bring to front" aria-label="Bring to front"><ArrowUp size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'up')} title="Forward" aria-label="Forward"><ArrowUp size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'down')} title="Backward" aria-label="Backward"><ArrowDown size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onMoveDrawing(selected.id, 'bottom')} title="Send to back" aria-label="Send to back"><ArrowDown size={14} /></button>
                <button className="ghost icon" type="button" onClick={() => onCopyDrawing(selected.id)} title="Copy" aria-label="Copy"><Copy size={14} /></button>
                {onAddAlert && <button className="ghost icon" type="button" onClick={() => onAddAlert(selected.id, alertOperator, alertTarget)} title="Add alert" aria-label="Add alert"><Bell size={14} /></button>}
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
              <div className="lwc-drawing-sync-row">
                <select
                  aria-label="Sync mode"
                  value={objectSyncMode}
                  onChange={(e) => {
                    const mode = e.currentTarget.value as SyncModeValue;
                    setObjectSyncMode(mode);
                    onSetSyncMode(selected.id, mode);
                  }}
                >
                  <option value="scope">This chart</option>
                  <option value="symbol">Symbol</option>
                  <option value="global">All charts</option>
                </select>
                <select
                  aria-label="Interval visibility"
                  value={intervalMode}
                  onChange={(e) => {
                    const mode = e.currentTarget.value as IntervalVisibilityMode;
                    setIntervalMode(mode);
                    onSetIntervalVisibility(selected.id, mode, intervalsFromText(intervalText));
                  }}
                >
                  <option value="all">All intervals</option>
                  <option value="only">Only</option>
                  <option value="except">Except</option>
                </select>
              </div>
              {intervalMode !== 'all' && (
                <input
                  key={`intervals-${selected.id}`}
                  value={intervalText}
                  aria-label="Visible intervals"
                  placeholder="1h, 4h, 1d"
                  onChange={(e) => setIntervalText(e.currentTarget.value)}
                  onBlur={(e) =>
                    onSetIntervalVisibility(selected.id, intervalMode, intervalsFromText(e.currentTarget.value))
                  }
                />
              )}
              {onAddAlert && (
                <div className="lwc-drawing-alert-row">
                  <select aria-label="Alert condition" value={alertOperator} onChange={(e) => setAlertOperator(e.currentTarget.value)}>
                    {ALERT_OPERATORS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <select aria-label="Alert target" value={alertTarget} onChange={(e) => setAlertTarget(e.currentTarget.value)}>
                    {ALERT_TARGETS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button className="ghost" type="button" onClick={() => onAddAlert(selected.id, alertOperator, alertTarget)} title="Create alert">
                    Add alert
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Fragment>
  );
}
