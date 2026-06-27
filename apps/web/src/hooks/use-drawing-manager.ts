import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Drawing } from '@tv/drawing-tools';
import { LwcDrawingManager } from '@tv/drawing-tools';
import type { DrawingManager, ChartSurfaceHandle } from '@tv/drawing-tools';
import { ourToolToLibraryType } from '@tv/drawing-tools';
import { api } from '../api/client';

const SAVE_DEBOUNCE_MS = 700;
const MAX_UNDO = 80;

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
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

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

  // Save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ symbol: string; interval: string; scope: string; drawings: Drawing[] } | null>(null);

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
      setDrawings(newDrawings);
      // Debounced save
      if (symbolId && storageScope) {
        pending.current = { symbol: symbolId, interval, scope: storageScope, drawings: newDrawings };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
      }
    });

    return () => {
      unsubChange();
      flush();
      mgr.detach();
      readyRef.current = false;
    };
  }, [active]);

  // Load server drawings when query resolves
  const scopeKey = `${symbolId ?? ''}|${interval}|${storageScope}`;
  const seededScope = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !readyRef.current) return;
    if (query.data && seededScope.current !== scopeKey) {
      flush();
      seededScope.current = scopeKey;
      managerRef.current?.importDrawings(query.data.drawings);
      setDrawings(query.data.drawings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scopeKey, query.data, readyRef.current]);

  // Cleanup on unmount
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toolbar actions ─────────────────────────────────────────────────

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
    const mgr = managerRef.current;
    if (!mgr) return;
    const id = mgr.getSelectedId();
    if (id) {
      const before = mgr.exportDrawings();
      mgr.remove(id);
      const after = mgr.exportDrawings();
      setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), before]);
      setRedoStack([]);
      setSelectedId(null);
    }
  }, []);

  const clearAll = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const before = mgr.exportDrawings();
    mgr.clear();
    const after = mgr.exportDrawings();
    setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), before]);
    setRedoStack([]);
    setSelectedId(null);
  }, []);

  const toggleLock = useCallback((id: string) => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const d = mgr.exportDrawings().find((x) => x.id === id);
    if (d) {
      mgr.setLocked(id, !d.lock);
    }
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const d = mgr.exportDrawings().find((x) => x.id === id);
    if (d) {
      mgr.setVisible(id, !d.visible);
    }
  }, []);

  const undo = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const prev = undoStack.at(-1);
    if (!prev) return;
    const current = mgr.exportDrawings();
    mgr.importDrawings(prev);
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s.slice(-(MAX_UNDO - 1)), current]);
    setDrawings(prev);
    setSelectedId(null);
  }, [undoStack]);

  const redo = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const next = redoStack.at(-1);
    if (!next) return;
    const current = mgr.exportDrawings();
    mgr.importDrawings(next);
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s.slice(-(MAX_UNDO - 1)), current]);
    setDrawings(next);
    setSelectedId(null);
  }, [redoStack]);

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
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
