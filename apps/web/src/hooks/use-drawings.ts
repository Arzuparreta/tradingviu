import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Drawing } from '@tv/drawing-tools';
import { api } from '../api/client';

const SAVE_DEBOUNCE_MS = 700;

interface UseDrawingsArgs {
  symbolId: string | null;
  interval: string;
  scopeId?: string;
  /** Gate the query (e.g. only when logged in). */
  enabled?: boolean;
}

interface UseDrawings {
  drawings: Drawing[];
  /** Replace the drawing set and schedule a debounced server save. */
  setDrawings: (next: Drawing[]) => void;
  ready: boolean;
}

/**
 * Loads a chart's drawings (per symbol + interval), holds them in local state,
 * and persists edits to the server on a debounce. The overlay fires `onChange`
 * on every pointer move while dragging, so coalescing the writes keeps the
 * network quiet and only the final geometry lands.
 */
export function useDrawings({ symbolId, interval, scopeId, enabled = true }: UseDrawingsArgs): UseDrawings {
  const queryClient = useQueryClient();
  const active = enabled && !!symbolId;
  const storageScope = scopeId ?? (symbolId ? `symbol:${symbolId}:${interval}` : '');

  const query = useQuery({
    queryKey: ['drawings', symbolId, interval, storageScope],
    queryFn: () => api.drawings(symbolId!, interval, storageScope || undefined),
    enabled: active,
    staleTime: 60_000,
  });

  const [drawings, setLocal] = useState<Drawing[]>([]);

  // Reseed local state whenever the chart's (symbol, interval) scope changes.
  const scopeKey = `${symbolId ?? ''}|${interval}|${storageScope}`;
  const seededScope = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The newest unsaved write, tagged with the scope it belongs to so a
  // scope switch can't misfile it onto the wrong symbol.
  const pending = useRef<{ symbol: string; interval: string; scope: string; drawings: Drawing[] } | null>(null);

  const flush = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    queryClient.setQueryData(['drawings', p.symbol, p.interval, p.scope], { drawings: p.drawings });
    void api.saveDrawings(p.symbol, p.interval, p.drawings, p.scope).catch(() => undefined);
  };

  useEffect(() => {
    if (!active) {
      flush();
      seededScope.current = null;
      setLocal([]);
      return;
    }
    if (query.data && seededScope.current !== scopeKey) {
      // New scope: persist anything still pending for the previous one first.
      flush();
      seededScope.current = scopeKey;
      setLocal(query.data.drawings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scopeKey, query.data]);

  // Persist the last pending write when the component unmounts.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const setDrawings = (next: Drawing[]) => {
    setLocal(next);
    if (!symbolId || !storageScope) return;
    pending.current = { symbol: symbolId, interval, scope: storageScope, drawings: next };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  return { drawings, setDrawings, ready: active && query.isSuccess };
}
