import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Bar } from '@tv/data-types';
import type { Interval } from '@tv/core';

export interface UseChartHistoryOpts {
  symbolId: string | null;
  interval: Interval;
  pageSize?: number;
}

export interface ChartSymbol {
  id: string;
  exchange: string;
  ticker: string;
  name: string;
}

export interface UseChartHistoryResult {
  bars: Bar[];
  symbol: ChartSymbol | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** Replace the bar at `time` in-place (e.g. for in-progress updates). */
  upsertBar: (bar: Bar) => void;
  /** Append a closed bar (no in-place merge). */
  appendBar: (bar: Bar) => void;
  /** Fetch and merge bars newer than `after` before inserting a live point with a gap. */
  loadNewer: (after: number) => Promise<void>;
  /** Reset everything (symbol/interval change). */
  reset: () => void;
}

const dedupeSort = (bars: Bar[]): Bar[] => {
  const m = new Map<number, Bar>();
  for (const b of bars) m.set(b.time, b);
  return Array.from(m.values()).sort((a, b) => a.time - b.time);
};

export const useChartHistory = (opts: UseChartHistoryOpts): UseChartHistoryResult => {
  const { symbolId, interval, pageSize = 500 } = opts;
  const queryClient = useQueryClient();
  const [extraBars, setExtraBars] = useState<Bar[]>([]);
  const [earliestLoadedTime, setEarliestLoadedTime] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastSymbolIdRef = useRef<string | null>(null);
  const lastIntervalRef = useRef<Interval | null>(null);

  const query = useQuery({
    queryKey: ['chart-history', symbolId, interval],
    queryFn: () => api.history(symbolId!, interval, pageSize),
    enabled: !!symbolId,
    staleTime: 30_000,
  });

  // Reset on symbol/interval change. We use state (not a ref) so that
  // clearing the stale flag forces a re-render. Otherwise `allBars`
  // stays stuck at `[]` until something else triggers a render.
  const [isStale, setIsStale] = useState(false);
  if (lastSymbolIdRef.current !== symbolId || lastIntervalRef.current !== interval) {
    lastSymbolIdRef.current = symbolId;
    lastIntervalRef.current = interval;
    setIsStale(true);
    if (extraBars.length > 0) setExtraBars([]);
    if (earliestLoadedTime !== null) setEarliestLoadedTime(null);
    if (!hasMore) setHasMore(true);
  }
  useEffect(() => {
    if (isStale && query.data && query.data.bars.length > 0) {
      setIsStale(false);
    }
  }, [query.data, isStale]);

  const baseBars = query.data?.bars ?? [];
  const allBars = useMemo(() => {
    if (isStale) return [];
    if (extraBars.length === 0) return baseBars;
    return dedupeSort([...extraBars, ...baseBars]);
  }, [baseBars, extraBars, isStale]);

  const loadMore = useCallback(async () => {
    if (!symbolId || !hasMore || isLoadingMore) return;
    const leftmost = allBars[0]?.time;
    if (leftmost === undefined) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/chart/history?symbol=${encodeURIComponent(symbolId)}&interval=${interval}&before=${leftmost}&limit=${pageSize}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('tv_token') ?? ''}` } },
      );
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const json = (await res.json()) as { bars: Bar[] };
      if (!json.bars || json.bars.length === 0) {
        setHasMore(false);
        return;
      }
      setExtraBars((prev) => dedupeSort([...json.bars, ...prev]));
      setEarliestLoadedTime(json.bars[0]?.time ?? null);
      if (json.bars.length < pageSize) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [symbolId, interval, pageSize, hasMore, isLoadingMore, allBars]);

  const upsertBar = useCallback(
    (bar: Bar) => {
      if (!symbolId) return;
      // Use the React Query cache for the latest view. This is debounced in
      // the caller; here we just set the new array.
      queryClient.setQueryData<{ bars: Bar[]; interval: string } | undefined>(
        ['chart-history', symbolId, interval],
        (old) => {
          if (!old) return old;
          const arr = [...old.bars];
          const idx = arr.findIndex((b) => b.time === bar.time);
          if (idx >= 0) arr[idx] = bar;
          else arr.push(bar);
          arr.sort((a, b) => a.time - b.time);
          return { ...old, bars: arr };
        },
      );
    },
    [symbolId, interval, queryClient],
  );

  const appendBar = useCallback(
    (bar: Bar) => {
      if (!symbolId) return;
      queryClient.setQueryData<{ bars: Bar[]; interval: string } | undefined>(
        ['chart-history', symbolId, interval],
        (old) => {
          if (!old) return old;
          const arr = [...old.bars];
          if (arr[arr.length - 1]?.time === bar.time) arr[arr.length - 1] = bar;
          else arr.push(bar);
          arr.sort((a, b) => a.time - b.time);
          return { ...old, bars: arr };
        },
      );
    },
    [symbolId, interval, queryClient],
  );

  const loadNewer = useCallback(
    async (after: number) => {
      if (!symbolId) return;
      const res = await fetch(
        `/api/chart/history?symbol=${encodeURIComponent(symbolId)}&interval=${interval}&after=${after}&limit=${pageSize}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('tv_token') ?? ''}` } },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { bars: Bar[] };
      if (!json.bars || json.bars.length === 0) return;
      queryClient.setQueryData<{ bars: Bar[]; interval: string } | undefined>(
        ['chart-history', symbolId, interval],
        (old) => (old ? { ...old, bars: dedupeSort([...old.bars, ...json.bars]) } : old),
      );
    },
    [symbolId, interval, pageSize, queryClient],
  );

  const reset = useCallback(() => {
    setExtraBars([]);
    setEarliestLoadedTime(null);
    setHasMore(true);
  }, []);

  return {
    bars: allBars,
    symbol: (query.data?.symbol as ChartSymbol | undefined) ?? null,
    isLoading: query.isLoading,
    isLoadingMore,
    error: query.error as Error | null,
    hasMore,
    loadMore,
    upsertBar,
    appendBar,
    loadNewer,
    reset,
  };
};
