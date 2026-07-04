import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AlertOperator } from '../api/types';
import { useAuth } from '../stores/auth';
import {
  DRAWING_INTERVAL,
  drawingScopeFor,
  KLineChartPanel,
  type KLineChartPanelHandle,
  type PanelBounds,
} from '../chart/KLineChartPanel';
import { ChartToolbar, type DrawingWorkspaceState, type MagnetMode } from '../chart/ChartToolbar';
import { TOOL_SHORTCUTS } from '../chart/tools';
import { IntervalPicker } from '../chart/IntervalPicker';
import {
  loadFavoriteIntervals,
  loadWorkspaceState,
  saveFavoriteIntervals,
  saveWorkspaceState,
  type WorkspaceState,
} from '../chart/workspace';
import {
  CHART_TYPE_LABELS,
  loadChartSettings,
  saveChartSettings,
  type AxisScale,
  type ChartSettings,
} from '../chart/theme';
import { INDICATORS, MAIN_INDICATORS, SUB_INDICATORS } from '../chart/indicators';
import {
  clampTime,
  defaultReplayTime,
  isTimeAtEnd,
  REPLAY_SPEEDS,
  replayStepMs,
} from '../lib/replay';
import {
  CHART_TYPES,
  defaultLayoutConfig,
  GRID_KEYS,
  GRID_PRESETS,
  INTERVALS,
  reflowToGrid,
  type ChartType,
  type GridKey,
  type Interval,
  type LayoutConfig,
  type Panel,
} from '@tv/layout-sync';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui';
import {
  IconArea,
  IconBarsOHLC,
  IconBellPlus,
  IconBookmark,
  IconCamera,
  IconCandles,
  IconChevronDown,
  IconGrid1,
  IconGrid16,
  IconGrid2,
  IconGrid4,
  IconGrid8,
  IconHollowCandles,
  IconIndicator,
  IconLink,
  IconPanelBottom,
  IconPanelRight,
  IconPause,
  IconPlay,
  IconPlus,
  IconReplay,
  IconSearch,
  IconSliders,
  IconStepBack,
  IconStepForward,
  IconTrash,
  type IconProps,
} from '../ui/icons';
import { WatchlistDock } from '../components/workspace/WatchlistDock';
import { SymbolContextDock } from '../components/workspace/SymbolContextDock';
import { MarketRibbon } from '../components/workspace/MarketRibbon';

/**
 * Chart-first workspace — the home of the terminal. One drawing toolbar on the
 * left drives the active panel; the top bar is symbol / interval / chart-type /
 * indicators / layout / replay; docks and ribbon add context without leaving
 * the chart.
 */

const CHART_TYPE_ICONS: Record<ChartType, ComponentType<IconProps>> = {
  candle_solid: IconCandles,
  candle_stroke: IconHollowCandles,
  ohlc: IconBarsOHLC,
  area: IconArea,
};

const GRID_ICONS: Record<GridKey, ComponentType<IconProps>> = {
  '1': IconGrid1,
  '2': IconGrid2,
  '4': IconGrid4,
  '8': IconGrid8,
  '16': IconGrid16,
};

const EMPTY_DRAWING_STATE: DrawingWorkspaceState = {
  canUndo: false,
  canRedo: false,
  allHidden: false,
  allLocked: false,
  count: 0,
};

interface AlertDraft {
  price: number;
  operator: AlertOperator;
  name: string;
}

export function WorkspacePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>();

  // Last working session (symbol, interval, chart type, indicators, grid) —
  // restored synchronously so the terminal reopens where you left off.
  const restored = useRef<WorkspaceState | null>(loadWorkspaceState());
  const [config, setConfig] = useState<LayoutConfig>(
    () => restored.current?.config ?? defaultLayoutConfig('1'),
  );
  const [currentId, setCurrentId] = useState<string | null>(() => restored.current?.layoutId ?? null);
  const [currentName, setCurrentName] = useState<string>(
    () => restored.current?.layoutName ?? 'Untitled',
  );
  // Gate autosave until the initial state is settled so we never persist the
  // transient default over a real saved layout on a cold first load.
  const [hydrated, setHydrated] = useState<boolean>(() => restored.current != null);
  const initialized = useRef(false);
  const appliedSymbol = useRef<string | null>(null);

  const [showDock, setShowDock] = useState(true);
  const [showRibbon, setShowRibbon] = useState(true);

  const panelRefs = useRef<Map<string, KLineChartPanelHandle>>(new Map());

  /* ── Chart settings + drawing toolbar state ────────────────────────── */

  const [settings, setSettings] = useState<ChartSettings>(loadChartSettings);
  const patchSettings = useCallback((patch: Partial<ChartSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveChartSettings(next);
      return next;
    });
  }, []);

  const [favoriteIntervals, setFavoriteIntervals] = useState<Interval[]>(loadFavoriteIntervals);
  const toggleFavoriteInterval = useCallback((interval: Interval) => {
    setFavoriteIntervals((prev) => {
      const next = prev.includes(interval)
        ? prev.filter((i) => i !== interval)
        : [...prev, interval];
      // Keep at least one favorite so the inline switcher never empties out.
      const resolved = next.length > 0 ? next : prev;
      saveFavoriteIntervals(resolved);
      return resolved;
    });
  }, []);

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [toolNonce, setToolNonce] = useState(0);
  const magnet: MagnetMode =
    settings.crosshairMagnet === 'weak' ? 'weak' : settings.crosshairMagnet === 'strong' ? 'strong' : 'off';

  const [drawingStates, setDrawingStates] = useState<Record<string, DrawingWorkspaceState>>({});
  const onDrawingState = useCallback((panelId: string, state: DrawingWorkspaceState) => {
    setDrawingStates((prev) => ({ ...prev, [panelId]: state }));
  }, []);

  const onToolConsumed = useCallback(() => {
    setActiveTool((tool) => {
      if (tool && loadChartSettings().stayInDrawingMode) {
        setToolNonce((n) => n + 1);
        return tool;
      }
      return null;
    });
  }, []);

  // Alt+<key> tool shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        e.preventDefault();
        setActiveTool(tool);
        setToolNonce((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Replay (synced across panels by cursor time) ──────────────────── */

  const bounds = useRef<Map<string, PanelBounds>>(new Map());
  const [boundsVersion, setBoundsVersion] = useState(0);
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayCursor, setReplayCursor] = useState<number | null>(null);

  const onBounds = useCallback((id: string, b: PanelBounds | null) => {
    if (b) bounds.current.set(id, b);
    else bounds.current.delete(id);
    setBoundsVersion((v) => v + 1);
  }, []);

  const replayDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let step = Infinity;
    for (const b of bounds.current.values()) {
      if (b.min < min) min = b.min;
      if (b.max > max) max = b.max;
      if (b.step < step) step = b.step;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { min, max, step: Number.isFinite(step) ? step : 60 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsVersion]);

  const layoutsQ = useQuery({ queryKey: ['layouts'], queryFn: () => api.layouts(), enabled: !!user });
  const symbolsQ = useQuery({
    queryKey: ['symbols-all'],
    queryFn: () => api.allSymbols(),
    staleTime: 120_000,
  });

  // Choose the initial layout once. Precedence: deep-linked symbol → restored
  // last session → default saved layout → cold-start BTCUSDT.
  useEffect(() => {
    if (initialized.current || !layoutsQ.data || !symbolsQ.data) return;
    initialized.current = true;
    if (routeSymbol) return; // deep-link effect handles it (and flips hydrated)
    if (restored.current) return; // already restored synchronously at init
    const pick = layoutsQ.data.layouts.find((l) => l.isDefault) ?? layoutsQ.data.layouts[0];
    if (pick) {
      setConfig(pick.config);
      setCurrentId(pick.id);
      setCurrentName(pick.name);
      setHydrated(true);
      return;
    }
    const rows = symbolsQ.data.results;
    const def = rows.find((r) => r.ticker === 'BTCUSDT') ?? rows[0];
    if (def) setConfig(defaultLayoutConfig('1', def.id));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutsQ.data, symbolsQ.data, routeSymbol]);

  // Apply a deep-linked symbol into the active panel once symbols resolve.
  useEffect(() => {
    if (!routeSymbol) return;
    const rows = symbolsQ.data?.results ?? [];
    if (rows.length === 0) return;
    const found = rows.find((r) => r.id === routeSymbol || r.ticker === routeSymbol);
    if (!found || appliedSymbol.current === found.id) return;
    appliedSymbol.current = found.id;
    initialized.current = true;
    setHydrated(true);
    setConfig((cfg) => {
      const idx = Math.min(cfg.activePanel, cfg.panels.length - 1);
      if (cfg.panels[idx]?.symbolId === found.id) return cfg;
      const panels = cfg.panels.map((p, i) => (i === idx ? { ...p, symbolId: found.id } : p));
      if (cfg.sync.symbol) return { ...cfg, panels: panels.map((p) => ({ ...p, symbolId: found.id })) };
      return { ...cfg, panels };
    });
  }, [routeSymbol, symbolsQ.data]);

  // Autosave the working session (debounced) so a reload restores it verbatim.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => {
      saveWorkspaceState({ config, layoutId: currentId, layoutName: currentName });
    }, 400);
    return () => window.clearTimeout(id);
  }, [config, currentId, currentName, hydrated]);

  // Advance the cursor while playing.
  useEffect(() => {
    if (!replayActive || !replayPlaying || !replayDomain) return;
    const { min, max, step } = replayDomain;
    const id = window.setInterval(() => {
      setReplayCursor((t) => clampTime((t ?? min) + step, min, max));
    }, replayStepMs(replaySpeed));
    return () => window.clearInterval(id);
  }, [replayActive, replayPlaying, replaySpeed, replayDomain]);

  useEffect(() => {
    if (replayPlaying && replayDomain && replayCursor != null && isTimeAtEnd(replayCursor, replayDomain.max)) {
      setReplayPlaying(false);
    }
  }, [replayPlaying, replayCursor, replayDomain]);

  useEffect(() => {
    if (!replayActive || !replayDomain) return;
    setReplayCursor((t) =>
      t == null
        ? defaultReplayTime(replayDomain.min, replayDomain.max)
        : clampTime(t, replayDomain.min, replayDomain.max),
    );
  }, [replayActive, replayDomain]);

  const enterReplay = () => {
    if (!replayDomain) return;
    setReplayCursor(defaultReplayTime(replayDomain.min, replayDomain.max));
    setReplayPlaying(false);
    setReplayActive(true);
  };
  const exitReplay = () => {
    setReplayActive(false);
    setReplayPlaying(false);
  };
  const replayStep = (dir: 1 | -1) => {
    if (!replayDomain) return;
    const { min, max, step } = replayDomain;
    setReplayPlaying(false);
    setReplayCursor((t) => clampTime((t ?? max) + dir * step, min, max));
  };
  const replayTogglePlay = () => {
    if (!replayDomain) return;
    if (!replayPlaying && (replayCursor == null || isTimeAtEnd(replayCursor, replayDomain.max))) {
      setReplayCursor(defaultReplayTime(replayDomain.min, replayDomain.max));
    }
    setReplayPlaying((p) => !p);
  };

  /* ── Panel/config updates ──────────────────────────────────────────── */

  const setGrid = (grid: GridKey) => setConfig((cfg) => reflowToGrid(cfg, grid));
  const toggleSync = () =>
    setConfig((cfg) => ({ ...cfg, sync: { ...cfg.sync, symbol: !cfg.sync.symbol } }));

  const updatePanel = useCallback((idx: number, patch: Partial<Panel>) => {
    setConfig((cfg) => {
      let panels = cfg.panels.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      if (cfg.sync.symbol && patch.symbolId !== undefined) {
        panels = panels.map((p) => ({ ...p, symbolId: patch.symbolId! }));
      }
      return { ...cfg, panels };
    });
  }, []);

  const activeIdx = Math.min(config.activePanel, config.panels.length - 1);
  const activePanel = config.panels[activeIdx];

  const setActiveInterval = useCallback(
    (interval: Interval) => updatePanel(activeIdx, { interval }),
    [activeIdx, updatePanel],
  );
  const setActiveChartType = useCallback(
    (chartType: ChartType) => updatePanel(activeIdx, { chartType }),
    [activeIdx, updatePanel],
  );
  const toggleActiveIndicator = useCallback(
    (id: string) => {
      const current = activePanel?.indicators ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      updatePanel(activeIdx, { indicators: next });
    },
    [activeIdx, activePanel?.indicators, updatePanel],
  );

  // Step the active panel's timeframe with [ (shorter) / ] (longer).
  const activeInterval = activePanel?.interval ?? '1h';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== '[' && e.key !== ']')) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const idx = INTERVALS.indexOf(activeInterval);
      if (idx === -1) return;
      const nextIdx =
        e.key === ']' ? Math.min(idx + 1, INTERVALS.length - 1) : Math.max(idx - 1, 0);
      if (nextIdx === idx) return;
      e.preventDefault();
      setActiveInterval(INTERVALS[nextIdx]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeInterval, setActiveInterval]);

  /* ── Layout persistence ────────────────────────────────────────────── */

  const persistDrawings = useCallback(async () => {
    for (const p of config.panels) {
      if (!p.symbolId) continue;
      const panelRef = panelRefs.current.get(p.id);
      if (!panelRef) continue;
      try {
        const drawings = panelRef.exportDrawings();
        if (drawings.length > 0) {
          await api.batchDrawings(
            p.symbolId,
            DRAWING_INTERVAL,
            { upsert: drawings },
            drawingScopeFor(p.symbolId),
          );
        }
      } catch {
        // individual drawing saves may fail; continue
      }
    }
  }, [config.panels]);

  const refreshLayouts = () => qc.invalidateQueries({ queryKey: ['layouts'] });

  const saveLayoutAs = async (name: string) => {
    if (!name.trim()) return;
    const { id } = await api.createLayout({ name: name.trim(), config });
    setCurrentId(id);
    setCurrentName(name.trim());
    await persistDrawings();
    await refreshLayouts();
  };
  const saveLayout = async () => {
    if (!currentId) return;
    await api.updateLayout(currentId, { config, name: currentName });
    await persistDrawings();
    await refreshLayouts();
  };
  const deleteLayout = async () => {
    if (!currentId) return;
    await api.deleteLayout(currentId);
    setCurrentId(null);
    setCurrentName('Untitled');
    setConfig(defaultLayoutConfig('1'));
    await refreshLayouts();
  };
  const loadLayout = (id: string) => {
    const row = layoutsQ.data?.layouts.find((l) => l.id === id);
    if (!row) return;
    setConfig(row.config);
    setCurrentId(row.id);
    setCurrentName(row.name);
  };
  const newLayout = () => {
    setConfig(defaultLayoutConfig('1', activePanel?.symbolId ?? null));
    setCurrentId(null);
    setCurrentName('Untitled');
  };

  /* ── Alerts from the chart ─────────────────────────────────────────── */

  const activeSymbol = useMemo(() => {
    const rows = symbolsQ.data?.results ?? [];
    return activePanel?.symbolId ? rows.find((r) => r.id === activePanel.symbolId) ?? null : null;
  }, [symbolsQ.data, activePanel?.symbolId]);

  const [alertDraft, setAlertDraft] = useState<AlertDraft | null>(null);
  const [alertSaving, setAlertSaving] = useState(false);

  const openAlertDraft = useCallback(
    (price?: number) => {
      if (!activeSymbol || !activePanel) return;
      const last = panelRefs.current.get(activePanel.id)?.lastClose() ?? null;
      const target = price ?? last;
      if (target == null) return;
      const operator: AlertOperator =
        last != null && target < last ? 'crosses_below' : 'crosses_above';
      setAlertDraft({
        price: Number(target.toPrecision(8)),
        operator,
        name: `${activeSymbol.ticker} ${operator === 'crosses_below' ? '↓' : '↑'} ${target.toPrecision(6)}`,
      });
    },
    [activePanel, activeSymbol],
  );

  const submitAlert = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!alertDraft || !activeSymbol) return;
      setAlertSaving(true);
      try {
        await api.createAlert({
          symbolId: activeSymbol.id,
          name: alertDraft.name,
          condition: { type: 'price', operator: alertDraft.operator, value: alertDraft.price },
          channels: ['in_app'],
        });
        await qc.invalidateQueries({ queryKey: ['alerts'] });
        setAlertDraft(null);
      } finally {
        setAlertSaving(false);
      }
    },
    [activeSymbol, alertDraft, qc],
  );

  /* ── Screenshot ────────────────────────────────────────────────────── */

  const downloadScreenshot = useCallback(() => {
    if (!activePanel) return;
    const url = panelRefs.current.get(activePanel.id)?.screenshotUrl();
    if (!url) return;
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `${activeSymbol?.ticker ?? 'chart'}_${activePanel.interval}_${stamp}.png`;
    a.click();
  }, [activePanel, activeSymbol]);

  /* ── Toolbar bulk actions (active panel) ───────────────────────────── */

  const activeDrawingState = (activePanel && drawingStates[activePanel.id]) ?? EMPTY_DRAWING_STATE;
  const activeRef = () => (activePanel ? panelRefs.current.get(activePanel.id) : undefined);

  const preset = GRID_PRESETS[config.grid];
  const multiPanel = config.panels.length > 1;

  const ChartTypeIcon = CHART_TYPE_ICONS[activePanel?.chartType ?? 'candle_solid'];
  const GridIcon = GRID_ICONS[config.grid];

  const [saveAsDraft, setSaveAsDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`ws${showRibbon ? ' has-ribbon' : ''}`}>
      <div className="ws-bar">
        <button
          type="button"
          className="ws-symbol-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('tv:open-cmdk'))}
          title="Change symbol (⌘K)"
        >
          <IconSearch size={13} className="ws-symbol-glass" />
          <strong>{activeSymbol ? activeSymbol.ticker : 'Symbol'}</strong>
          {activeSymbol && <span>{activeSymbol.exchange}</span>}
        </button>

        <span className="ws-divider" />

        <IntervalPicker
          value={activeInterval}
          onChange={setActiveInterval}
          favorites={favoriteIntervals}
          onToggleFavorite={toggleFavoriteInterval}
        />

        <Menu title="Chart type" button={<ChartTypeIcon size={17} />}>
          {(close) => (
            <>
              {CHART_TYPES.map((t) => {
                const Icon = CHART_TYPE_ICONS[t];
                return (
                  <MenuItem
                    key={t}
                    icon={<Icon size={15} />}
                    label={CHART_TYPE_LABELS[t]}
                    checked={activePanel?.chartType === t}
                    onSelect={() => {
                      setActiveChartType(t);
                      close();
                    }}
                  />
                );
              })}
            </>
          )}
        </Menu>

        <Menu
          title="Indicators"
          width={230}
          button={
            <span className="ws-menu-labeled">
              <IconIndicator size={16} />
              <span>Indicators</span>
              {(activePanel?.indicators.length ?? 0) > 0 && (
                <em>{activePanel?.indicators.length}</em>
              )}
            </span>
          }
        >
          {() => (
            <>
              <MenuLabel>On chart</MenuLabel>
              {MAIN_INDICATORS.map((ind) => (
                <MenuItem
                  key={ind.id}
                  label={ind.label}
                  meta={ind.id}
                  checked={activePanel?.indicators.includes(ind.id)}
                  onSelect={() => toggleActiveIndicator(ind.id)}
                />
              ))}
              <MenuSeparator />
              <MenuLabel>Below chart</MenuLabel>
              {SUB_INDICATORS.map((ind) => (
                <MenuItem
                  key={ind.id}
                  label={ind.label}
                  meta={ind.id}
                  checked={activePanel?.indicators.includes(ind.id)}
                  onSelect={() => toggleActiveIndicator(ind.id)}
                />
              ))}
            </>
          )}
        </Menu>

        <span className="ws-divider" />

        <Menu title="Panel grid" button={<GridIcon size={17} />}>
          {(close) => (
            <>
              {GRID_KEYS.map((g) => {
                const Icon = GRID_ICONS[g];
                return (
                  <MenuItem
                    key={g}
                    icon={<Icon size={15} />}
                    label={GRID_PRESETS[g].label}
                    checked={config.grid === g}
                    onSelect={() => {
                      setGrid(g);
                      close();
                    }}
                  />
                );
              })}
              {multiPanel && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    icon={<IconLink size={14} />}
                    label="Sync symbol across panels"
                    checked={config.sync.symbol}
                    onSelect={toggleSync}
                  />
                </>
              )}
            </>
          )}
        </Menu>

        <Menu
          title="Layouts"
          width={220}
          className="ws-layout-menu"
          button={
            <span className="ws-menu-labeled">
              <IconBookmark size={15} />
              <span className="ellipsis" style={{ maxWidth: 110 }}>
                {currentName}
              </span>
              <IconChevronDown size={11} />
            </span>
          }
        >
          {(close) => (
            <>
              {(layoutsQ.data?.layouts.length ?? 0) > 0 && (
                <>
                  <MenuLabel>Saved layouts</MenuLabel>
                  {layoutsQ.data?.layouts.map((l) => (
                    <MenuItem
                      key={l.id}
                      label={l.name}
                      meta={l.isDefault ? '★' : undefined}
                      checked={l.id === currentId}
                      onSelect={() => {
                        loadLayout(l.id);
                        close();
                      }}
                    />
                  ))}
                  <MenuSeparator />
                </>
              )}
              {currentId && (
                <MenuItem
                  icon={<IconBookmark size={14} />}
                  label={`Save "${currentName}"`}
                  onSelect={() => {
                    void saveLayout();
                    close();
                  }}
                />
              )}
              <form
                className="ui-menu-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveLayoutAs(saveAsDraft);
                  setSaveAsDraft('');
                  close();
                }}
              >
                <input
                  placeholder="Save as…"
                  value={saveAsDraft}
                  onChange={(e) => setSaveAsDraft(e.target.value)}
                />
                <button type="submit" className="sm" disabled={!saveAsDraft.trim()}>
                  <IconPlus size={12} />
                </button>
              </form>
              <MenuItem icon={<IconPlus size={14} />} label="New layout" onSelect={() => { newLayout(); close(); }} />
              {currentId &&
                (confirmDelete ? (
                  <MenuItem
                    icon={<IconTrash size={14} />}
                    label={`Really delete "${currentName}"?`}
                    danger
                    onSelect={() => {
                      setConfirmDelete(false);
                      void deleteLayout();
                      close();
                    }}
                  />
                ) : (
                  <MenuItem
                    icon={<IconTrash size={14} />}
                    label="Delete layout"
                    danger
                    onSelect={() => setConfirmDelete(true)}
                  />
                ))}
            </>
          )}
        </Menu>

        <span className="ws-divider" />

        <button
          className={`icon-btn${replayActive ? ' active' : ''}`}
          onClick={() => (replayActive ? exitReplay() : enterReplay())}
          disabled={!replayDomain}
          title={replayDomain ? 'Bar replay' : 'Load a symbol to replay'}
        >
          <IconReplay size={16} />
        </button>
        {replayActive && (
          <div className="ws-replay">
            <button className="icon-btn" onClick={() => replayStep(-1)} title="Step back">
              <IconStepBack size={14} />
            </button>
            <button className="icon-btn" onClick={replayTogglePlay} title={replayPlaying ? 'Pause' : 'Play'}>
              {replayPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
            </button>
            <button className="icon-btn" onClick={() => replayStep(1)} title="Step forward">
              <IconStepForward size={14} />
            </button>
            <Menu title="Replay speed" button={<span className="ws-replay-speed">{replaySpeed}×</span>}>
              {(close) => (
                <>
                  {REPLAY_SPEEDS.map((s) => (
                    <MenuItem
                      key={s}
                      label={`${s}×`}
                      checked={s === replaySpeed}
                      onSelect={() => {
                        setReplaySpeed(s);
                        close();
                      }}
                    />
                  ))}
                </>
              )}
            </Menu>
            {replayCursor != null && (
              <span className="muted small mono">{new Date(replayCursor * 1000).toLocaleString()}</span>
            )}
          </div>
        )}

        <span className="grow" />

        <button
          className="icon-btn"
          onClick={() => openAlertDraft()}
          disabled={!activeSymbol}
          title="Create alert at last price"
        >
          <IconBellPlus size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={downloadScreenshot}
          disabled={!activeSymbol}
          title="Download chart image"
        >
          <IconCamera size={16} />
        </button>

        <Menu title="Chart settings" align="right" width={230} button={<IconSliders size={16} />}>
          {() => (
            <>
              <MenuLabel>Price scale</MenuLabel>
              {(['normal', 'percentage', 'log'] as AxisScale[]).map((axis) => (
                <MenuItem
                  key={axis}
                  label={axis === 'normal' ? 'Regular' : axis === 'percentage' ? 'Percent' : 'Logarithmic'}
                  checked={settings.axis === axis}
                  onSelect={() => patchSettings({ axis })}
                />
              ))}
              <MenuSeparator />
              <MenuItem label="Grid lines" checked={settings.grid} onSelect={() => patchSettings({ grid: !settings.grid })} />
              <MenuItem
                label="Last price line"
                checked={settings.lastPriceLine}
                onSelect={() => patchSettings({ lastPriceLine: !settings.lastPriceLine })}
              />
              <MenuItem
                label="High/low labels"
                checked={settings.highLowMarks}
                onSelect={() => patchSettings({ highLowMarks: !settings.highLowMarks })}
              />
              <MenuSeparator />
              <MenuItem
                label="Stay in drawing mode"
                checked={settings.stayInDrawingMode}
                onSelect={() => patchSettings({ stayInDrawingMode: !settings.stayInDrawingMode })}
              />
            </>
          )}
        </Menu>

        <span className="ws-divider" />

        <button
          className={`icon-btn${showDock ? ' active' : ''}`}
          onClick={() => setShowDock((s) => !s)}
          title="Toggle side dock"
        >
          <IconPanelRight size={16} />
        </button>
        <button
          className={`icon-btn${showRibbon ? ' active' : ''}`}
          onClick={() => setShowRibbon((s) => !s)}
          title="Toggle news ribbon"
        >
          <IconPanelBottom size={16} />
        </button>
      </div>

      <div className={`ws-body${showDock ? ' with-dock' : ''}`}>
        <ChartToolbar
          activeTool={activeTool}
          onSelectTool={(tool) => {
            setActiveTool(tool);
            if (tool) setToolNonce((n) => n + 1);
          }}
          magnet={magnet}
          onMagnetChange={(mode) => patchSettings({ crosshairMagnet: mode })}
          stayInDrawingMode={settings.stayInDrawingMode}
          onToggleStay={() => patchSettings({ stayInDrawingMode: !settings.stayInDrawingMode })}
          drawingState={activeDrawingState}
          onUndo={() => activeRef()?.undo()}
          onRedo={() => activeRef()?.redo()}
          onToggleHideAll={() => activeRef()?.setAllVisible(activeDrawingState.allHidden)}
          onToggleLockAll={() => activeRef()?.setAllLocked(!activeDrawingState.allLocked)}
          onDeleteAll={() => activeRef()?.removeAll()}
        />

        <div className="ws-charts">
          <div
            className={`layout-grid${multiPanel ? ' multi-panel' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${preset.cols}, 1fr)`,
              gridTemplateRows: `repeat(${preset.rows}, 1fr)`,
              height: '100%',
            }}
          >
            {config.panels.map((p, i) => (
              <KLineChartPanel
                key={p.id}
                ref={(r) => {
                  if (r) panelRefs.current.set(p.id, r);
                  else panelRefs.current.delete(p.id);
                }}
                panel={p}
                symbol={p.symbolId ? symbolsQ.data?.results.find((s) => s.id === p.symbolId) ?? null : null}
                active={config.activePanel === i}
                live={config.activePanel === i && !replayActive}
                settings={settings}
                activeTool={config.activePanel === i ? activeTool : null}
                toolNonce={toolNonce}
                magnet={magnet}
                onToolConsumed={onToolConsumed}
                onActivate={() => setConfig((cfg) => ({ ...cfg, activePanel: i }))}
                onDrawingState={onDrawingState}
                onRequestAlert={config.activePanel === i ? openAlertDraft : undefined}
                replayActive={replayActive}
                replayCursor={replayActive ? replayCursor : null}
                onBounds={onBounds}
              />
            ))}
          </div>
        </div>

        {showDock && (
          <aside className="ws-dock">
            <WatchlistDock />
            <SymbolContextDock
              symbolId={activeSymbol?.id ?? null}
              ticker={activeSymbol?.ticker ?? null}
            />
          </aside>
        )}
      </div>

      {showRibbon && <MarketRibbon />}

      {alertDraft && activeSymbol && (
        <div className="ws-modal-backdrop" onMouseDown={() => setAlertDraft(null)}>
          <form className="ws-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submitAlert}>
            <div className="ws-modal-title">
              <IconBellPlus size={16} />
              <span>
                Alert on <strong>{activeSymbol.ticker}</strong>
              </span>
            </div>
            <label>
              Condition
              <div className="ws-modal-row">
                <select
                  value={alertDraft.operator}
                  onChange={(e) => setAlertDraft({ ...alertDraft, operator: e.target.value as AlertOperator })}
                >
                  <option value="crosses_above">Crosses above</option>
                  <option value="crosses_below">Crosses below</option>
                  <option value="above">Is above</option>
                  <option value="below">Is below</option>
                </select>
                <input
                  type="number"
                  step="any"
                  value={alertDraft.price}
                  onChange={(e) => setAlertDraft({ ...alertDraft, price: Number(e.target.value) })}
                />
              </div>
            </label>
            <label>
              Name
              <input
                value={alertDraft.name}
                onChange={(e) => setAlertDraft({ ...alertDraft, name: e.target.value })}
              />
            </label>
            <div className="ws-modal-actions">
              <button type="button" onClick={() => setAlertDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={alertSaving || !Number.isFinite(alertDraft.price)}>
                Create alert
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
