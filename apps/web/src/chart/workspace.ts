import {
  INTERVALS,
  LayoutConfigSchema,
  normalizeLayoutConfig,
  type Interval,
  type LayoutConfig,
} from '@tv/layout-sync';

/**
 * Workspace persistence — the terminal remembers where you left off.
 *
 * The working layout (symbol, interval, chart type, indicators, grid, focused
 * panel) is autosaved to localStorage on every change, so reopening the app
 * restores the exact chart you were looking at — no need to save a named layout
 * first. Named layouts remain explicit snapshots you can jump between; this is
 * the ambient "last session" that sits underneath them.
 */

const STATE_KEY = 'tv_workspace_state';
const FAVORITES_KEY = 'tv_interval_favorites';

export interface WorkspaceState {
  config: LayoutConfig;
  /** Named layout this working state derives from, if any. */
  layoutId: string | null;
  layoutName: string;
}

interface StoredState {
  config?: unknown;
  layoutId?: unknown;
  layoutName?: unknown;
}

/** Restore the last working session, or null if none/invalid (schema drift). */
export function loadWorkspaceState(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredState;
    const parsed = LayoutConfigSchema.safeParse(stored.config);
    if (!parsed.success) return null;
    return {
      config: normalizeLayoutConfig(parsed.data),
      layoutId: typeof stored.layoutId === 'string' ? stored.layoutId : null,
      layoutName: typeof stored.layoutName === 'string' ? stored.layoutName : 'Untitled',
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

/* ── Favorite timeframes ──────────────────────────────────────────────────── */

/** Timeframes promoted to the inline switcher; the rest live in the dropdown. */
export const DEFAULT_FAVORITE_INTERVALS: Interval[] = ['5m', '15m', '1h', '4h', '1d'];

const isInterval = (value: unknown): value is Interval =>
  typeof value === 'string' && (INTERVALS as readonly string[]).includes(value);

export function loadFavoriteIntervals(): Interval[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return DEFAULT_FAVORITE_INTERVALS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_FAVORITE_INTERVALS;
    const favorites = parsed.filter(isInterval);
    return favorites.length > 0 ? favorites : DEFAULT_FAVORITE_INTERVALS;
  } catch {
    return DEFAULT_FAVORITE_INTERVALS;
  }
}

export function saveFavoriteIntervals(favorites: readonly Interval[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    return;
  }
}

/** Favorites shown in canonical interval order (storage order is irrelevant). */
export const orderedFavorites = (favorites: readonly Interval[]): Interval[] =>
  INTERVALS.filter((i) => favorites.includes(i));
