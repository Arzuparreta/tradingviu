import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Drawing } from '@tv/drawing-tools';
import { LwcDrawingManager } from '@tv/drawing-tools';
import type { DrawingManager, ChartSurfaceHandle } from '@tv/drawing-tools';
import { ourToolToLibraryType } from '@tv/drawing-tools';
import { api } from '../api/client';

const SAVE_DEBOUNCE_MS = 700;
const MAX_UNDO = 80;

export interface DrawingStylePatch {
  readonly lineColor?: string;
  readonly fillColor?: string;
  readonly textColor?: string;
  readonly lineWidth?: number;
  readonly lineStyle?: 'solid' | 'dashed';
}

type ZOrderDirection = 'up' | 'down' | 'top' | 'bottom';

let drawingClipboard: Drawing | null = null;

interface UseDrawingManagerArgs {
  surfaceRef: React.RefObject<ChartSurfaceHandle | null>;
  symbolId: string | null;
  interval: string;
  scopeId?: string;
  /** Gate: the chart surface must be ready (chart+series created). */
  chartReady?: boolean;
  enabled?: boolean;
}

interface UseDrawingManagerResult {
  /** The imperative drawing manager instance. */
  manager: DrawingManager | null;
  /** Current list of drawings (our format). */
  drawings: Drawing[];
  /** Whether the manager is attached and ready. */
  ready: boolean;
  /** Currently active tool type, or null in cursor mode. */
  activeTool: string | null;
  /** ID of the selected drawing, or null. */
  selectedId: string | null;
  /** Whether a tool placement is in progress. */
  isPlacing: boolean;

  // Toolbar actions
  startTool: (ourToolName: string) => void;
  cancelPlacement: () => void;
  selectDrawing: (id: string | null) => void;
  removeSelected: () => void;
  clearAll: () => void;
  toggleLock: (id: string) => void;
  toggleVisibility: (id: string) => void;
  renameDrawing: (id: string, label: string) => void;
  updateStyle: (id: string, patch: DrawingStylePatch) => void;
  duplicateDrawing: (id: string) => void;
  copyDrawing: (id: string) => void;
  pasteDrawing: () => void;
  moveDrawing: (id: string, direction: ZOrderDirection) => void;
  setDrawingGroup: (id: string, groupId: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const drawingLabel = (drawing: Drawing): string => {
  const extendData = drawing.extendData;
  if (extendData && typeof extendData === 'object' && !Array.isArray(extendData)) {
    const label = (extendData as Record<string, unknown>).label;
    if (typeof label === 'string' && label.trim().length > 0) return label.trim();
  }
  return drawing.name;
};

const nowMs = (): number => Date.now();

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

const sortDrawings = (items: readonly Drawing[]): Drawing[] =>
  [...items].sort((a, b) => (a.zLevel ?? 0) - (b.zLevel ?? 0));

const sameDrawings = (a: readonly Drawing[], b: readonly Drawing[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const normalizeZLevels = (items: readonly Drawing[]): Drawing[] =>
  items.map((drawing, index) => ({ ...drawing, zLevel: index, updatedAt: drawing.updatedAt }));

const withLabel = (drawing: Drawing, label: string): Drawing => {
  const extendData =
    drawing.extendData &&
    typeof drawing.extendData === 'object' &&
    !Array.isArray(drawing.extendData)
      ? { ...(drawing.extendData as Record<string, unknown>) }
      : {};
  const trimmed = label.trim();
  if (trimmed.length > 0 && trimmed !== drawing.name) {
    extendData.label = trimmed;
  } else {
    delete extendData.label;
  }
  return {
    ...drawing,
    extendData: Object.keys(extendData).length > 0 ? extendData : undefined,
    updatedAt: nowMs(),
  };
};

const withStylePatch = (drawing: Drawing, patch: DrawingStylePatch): Drawing => {
  const styles =
    drawing.styles && typeof drawing.styles === 'object' && !Array.isArray(drawing.styles)
      ? { ...(drawing.styles as Record<string, unknown>) }
      : {};
  const line =
    styles.line && typeof styles.line === 'object' && !Array.isArray(styles.line)
      ? { ...(styles.line as Record<string, unknown>) }
      : {};
  const polygon =
    styles.polygon && typeof styles.polygon === 'object' && !Array.isArray(styles.polygon)
      ? { ...(styles.polygon as Record<string, unknown>) }
      : {};
  const text =
    styles.text && typeof styles.text === 'object' && !Array.isArray(styles.text)
      ? { ...(styles.text as Record<string, unknown>) }
      : {};

  if (patch.lineColor !== undefined) {
    line.color = patch.lineColor;
    polygon.borderColor = patch.lineColor;
  }
  if (patch.lineWidth !== undefined) {
    line.size = patch.lineWidth;
    polygon.borderSize = patch.lineWidth;
  }
  if (patch.lineStyle !== undefined) {
    line.style = patch.lineStyle;
  }
  if (patch.fillColor !== undefined) {
    polygon.color = patch.fillColor;
  }
  if (patch.textColor !== undefined) {
    text.color = patch.textColor;
  }

  return {
    ...drawing,
    styles: {
      ...styles,
      line,
      polygon,
      text,
    },
    updatedAt: nowMs(),
  };
};

const nextDuplicateId = (): string =>
  `draw_${nowMs().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const duplicateDrawingValue = (drawing: Drawing, maxZ: number): Drawing => {
  const cloned = cloneDrawing(drawing);
  const timeOffset = 60_000;
  const priceDelta = cloned.points.reduce((acc, point) => {
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      return Math.max(acc, Math.abs(point.value) * 0.002);
    }
    return acc;
  }, 0.5);
  const createdAt = nowMs();
  return {
    ...cloned,
    id: nextDuplicateId(),
    points: cloned.points.map((point) => ({
      ...point,
      timestamp:
        typeof point.timestamp === 'number' ? point.timestamp + timeOffset : point.timestamp,
      value: typeof point.value === 'number' ? point.value + priceDelta : point.value,
    })),
    zLevel: maxZ + 1,
    createdAt,
    updatedAt: createdAt,
  };
};

/**
 * Creates and manages an LwcDrawingManager instance bound to a ChartSurface.
 * Handles load/save from the server and undo/redo history.
 */
export function useDrawingManager({
  surfaceRef,
  symbolId,
  interval,
  scopeId,
  chartReady = false,
  enabled = true,
}: UseDrawingManagerArgs): UseDrawingManagerResult {
  const queryClient = useQueryClient();
  const active = enabled && !!symbolId && chartReady;
  const storageScope = scopeId ?? (symbolId ? `symbol:${symbolId}:${interval}` : '');

  // Server query
  const query = useQuery({
    queryKey: ['drawings', symbolId, interval, storageScope],
    queryFn: () => api.drawings(symbolId!, interval, storageScope || undefined),
    enabled: active,
    staleTime: 60_000,
  });

  // Manager ref
  const managerRef = useRef<LwcDrawingManager | null>(null);
  const readyRef = useRef(false);

  // Local state
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [undoStack, setUndoStack] = useState<Drawing[][]>([]);
  const [redoStack, setRedoStack] = useState<Drawing[][]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const suppressManagerChange = useRef(false);

  // Save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    symbol: string;
    interval: string;
    scope: string;
    drawings: Drawing[];
  } | null>(null);

  const setDrawingsState = useCallback((next: readonly Drawing[]) => {
    const sorted = sortDrawings(next);
    drawingsRef.current = sorted;
    setDrawings(sorted);
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    queryClient.setQueryData(['drawings', p.symbol, p.interval, p.scope], { drawings: p.drawings });
    void api.saveDrawings(p.symbol, p.interval, p.drawings, p.scope).catch(() => undefined);
  }, [queryClient]);

  const queueSave = useCallback(
    (newDrawings: readonly Drawing[]) => {
      if (!symbolId || !storageScope) return;
      const payload = sortDrawings(newDrawings);
      pending.current = { symbol: symbolId, interval, scope: storageScope, drawings: payload };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, interval, storageScope, symbolId],
  );

  // Create manager and attach to surface
  useEffect(() => {
    if (!active) return;
    // Create manager once
    if (!managerRef.current) {
      managerRef.current = new LwcDrawingManager();
    }
    const surface = surfaceRef.current;
    if (!surface) return;

    const mgr = managerRef.current;

    // Attach
    try {
      mgr.attach(surface);
    } catch {
      // Surface not ready yet (container might be null in layout)
      return;
    }

    readyRef.current = true;

    // Subscribe to changes
    const unsubChange = mgr.onChange((newDrawings) => {
      if (suppressManagerChange.current) return;
      const sorted = sortDrawings(newDrawings);
      const before = drawingsRef.current;
      setDrawingsState(sorted);
      if (!mgr.isPlacing()) {
        setActiveTool(null);
        setIsPlacing(false);
        setSelectedId(mgr.getSelectedId());
      }
      if (!sameDrawings(before, sorted)) {
        setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), before]);
        setRedoStack([]);
      }
      queueSave(sorted);
    });

    return () => {
      unsubChange();
      flush();
      mgr.detach();
      readyRef.current = false;
    };
  }, [active, queueSave, setDrawingsState]);

  // Load server drawings when query resolves
  const scopeKey = `${symbolId ?? ''}|${interval}|${storageScope}`;
  const seededScope = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !readyRef.current) return;
    if (query.data && seededScope.current !== scopeKey) {
      flush();
      seededScope.current = scopeKey;
      suppressManagerChange.current = true;
      managerRef.current?.importDrawings(query.data.drawings);
      suppressManagerChange.current = false;
      setDrawingsState(query.data.drawings);
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scopeKey, query.data, setDrawingsState, readyRef.current]);

  // Cleanup on unmount
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toolbar actions ─────────────────────────────────────────────────

  const commitDrawings = useCallback(
    (nextRaw: readonly Drawing[], selected: string | null, pushHistory = true) => {
      const mgr = managerRef.current;
      if (!mgr) return;
      const before = drawingsRef.current;
      const next = normalizeZLevels(nextRaw);
      if (sameDrawings(before, next)) return;
      suppressManagerChange.current = true;
      mgr.importDrawings(next);
      if (selected) mgr.select(selected);
      suppressManagerChange.current = false;
      if (pushHistory) {
        setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), before]);
        setRedoStack([]);
      }
      setDrawingsState(next);
      setSelectedId(selected);
      queueSave(next);
    },
    [queueSave, setDrawingsState],
  );

  const startTool = useCallback((ourToolName: string) => {
    const libType = ourToolToLibraryType(ourToolName);
    managerRef.current?.startTool(libType);
    setActiveTool(ourToolName);
    setIsPlacing(true);
    setSelectedId(null);
  }, []);

  const cancelPlacement = useCallback(() => {
    managerRef.current?.cancelPlacement();
    setActiveTool(null);
    setIsPlacing(false);
  }, []);

  const selectDrawing = useCallback((id: string | null) => {
    managerRef.current?.select(id);
    setSelectedId(id);
    setActiveTool(null);
    setIsPlacing(false);
  }, []);

  const removeSelected = useCallback(() => {
    const id = selectedId ?? managerRef.current?.getSelectedId();
    if (id) {
      commitDrawings(
        drawingsRef.current.filter((drawing) => drawing.id !== id),
        null,
      );
    }
  }, [commitDrawings, selectedId]);

  const clearAll = useCallback(() => {
    if (!managerRef.current || drawingsRef.current.length === 0) return;
    commitDrawings([], null);
  }, [commitDrawings]);

  const toggleLock = useCallback(
    (id: string) => {
      const next = drawingsRef.current.map((drawing) =>
        drawing.id === id ? { ...drawing, lock: !drawing.lock, updatedAt: nowMs() } : drawing,
      );
      commitDrawings(next, id);
    },
    [commitDrawings],
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      const next = drawingsRef.current.map((drawing) =>
        drawing.id === id ? { ...drawing, visible: !drawing.visible, updatedAt: nowMs() } : drawing,
      );
      commitDrawings(next, id);
    },
    [commitDrawings],
  );

  const renameDrawing = useCallback(
    (id: string, label: string) => {
      const next = drawingsRef.current.map((drawing) =>
        drawing.id === id ? withLabel(drawing, label) : drawing,
      );
      commitDrawings(next, id);
    },
    [commitDrawings],
  );

  const updateStyle = useCallback(
    (id: string, patch: DrawingStylePatch) => {
      const next = drawingsRef.current.map((drawing) =>
        drawing.id === id ? withStylePatch(drawing, patch) : drawing,
      );
      commitDrawings(next, id);
    },
    [commitDrawings],
  );

  const duplicateDrawing = useCallback(
    (id: string) => {
      const source = drawingsRef.current.find((drawing) => drawing.id === id);
      if (!source) return;
      const maxZ = drawingsRef.current.reduce(
        (max, drawing) => Math.max(max, drawing.zLevel ?? 0),
        -1,
      );
      const copy = duplicateDrawingValue(source, maxZ);
      commitDrawings([...drawingsRef.current, copy], copy.id);
    },
    [commitDrawings],
  );

  const copyDrawing = useCallback((id: string) => {
    const source = drawingsRef.current.find((drawing) => drawing.id === id);
    drawingClipboard = source ? cloneDrawing(source) : null;
  }, []);

  const pasteDrawing = useCallback(() => {
    if (!drawingClipboard) return;
    const maxZ = drawingsRef.current.reduce(
      (max, drawing) => Math.max(max, drawing.zLevel ?? 0),
      -1,
    );
    const copy = duplicateDrawingValue(drawingClipboard, maxZ);
    commitDrawings([...drawingsRef.current, copy], copy.id);
  }, [commitDrawings]);

  const moveDrawing = useCallback(
    (id: string, direction: ZOrderDirection) => {
      const ordered = normalizeZLevels(drawingsRef.current);
      const index = ordered.findIndex((drawing) => drawing.id === id);
      if (index < 0) return;
      const [item] = ordered.splice(index, 1);
      if (!item) return;
      const nextIndex =
        direction === 'top'
          ? ordered.length
          : direction === 'bottom'
            ? 0
            : direction === 'up'
              ? Math.min(ordered.length, index + 1)
              : Math.max(0, index - 1);
      ordered.splice(nextIndex, 0, item);
      commitDrawings(ordered, id);
    },
    [commitDrawings],
  );

  const setDrawingGroup = useCallback(
    (id: string, groupId: string | null) => {
      const normalized = groupId?.trim() ?? '';
      const next = drawingsRef.current.map((drawing) =>
        drawing.id === id
          ? {
              ...drawing,
              groupId: normalized.length > 0 ? normalized : undefined,
              updatedAt: nowMs(),
            }
          : drawing,
      );
      commitDrawings(next, id);
    },
    [commitDrawings],
  );

  const undo = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const prev = undoStack.at(-1);
    if (!prev) return;
    const current = mgr.exportDrawings();
    suppressManagerChange.current = true;
    mgr.importDrawings(prev);
    suppressManagerChange.current = false;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s.slice(-(MAX_UNDO - 1)), current]);
    setDrawingsState(prev);
    setSelectedId(null);
    queueSave(prev);
  }, [queueSave, setDrawingsState, undoStack]);

  const redo = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const next = redoStack.at(-1);
    if (!next) return;
    const current = mgr.exportDrawings();
    suppressManagerChange.current = true;
    mgr.importDrawings(next);
    suppressManagerChange.current = false;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), current]);
    setDrawingsState(next);
    setSelectedId(null);
    queueSave(next);
  }, [queueSave, redoStack, setDrawingsState]);

  return {
    manager: managerRef.current,
    drawings,
    ready: active && readyRef.current,
    activeTool,
    selectedId,
    isPlacing,
    startTool,
    cancelPlacement,
    selectDrawing,
    removeSelected,
    clearAll,
    toggleLock,
    toggleVisibility,
    renameDrawing,
    updateStyle,
    duplicateDrawing,
    copyDrawing,
    pasteDrawing,
    moveDrawing,
    setDrawingGroup,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
