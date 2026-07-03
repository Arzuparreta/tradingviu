import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PanelBottom,
  PanelRight,
  Pause,
  Play,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import {
  KLineChartPanel,
  type KLineChartPanelHandle,
  type PanelBounds,
} from '../chart/KLineChartPanel';
import {
  clampTime,
  defaultReplayTime,
  isTimeAtEnd,
  REPLAY_SPEEDS,
  replayStepMs,
} from '../lib/replay';
import {
  defaultLayoutConfig,
  GRID_KEYS,
  GRID_PRESETS,
  INTERVALS,
  reflowToGrid,
  type GridKey,
  type Interval,
  type LayoutConfig,
  type Panel,
} from '@tv/layout-sync';
import { Segmented } from '../ui';
import { WatchlistDock } from '../components/workspace/WatchlistDock';
import { SymbolContextDock } from '../components/workspace/SymbolContextDock';
import { MarketRibbon } from '../components/workspace/MarketRibbon';

/**
 * Chart-first workspace — the home of the terminal. Built on the layout-sync
 * grid engine + KLineChartPanel: grid `1` is the single-chart surface, the
 * larger grids tile multiple symbols. Saved layouts are presets. The right
 * docks and bottom ribbon supply context without leaving the chart.
 */
export function WorkspacePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { symbol: routeSymbol } = useParams<{ symbol?: string }>();

  const [config, setConfig] = useState<LayoutConfig>(() => defaultLayoutConfig('1'));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>('Untitled');
  const initialized = useRef(false);
  const appliedSymbol = useRef<string | null>(null);

  const [showDock, setShowDock] = useState(true);
  const [showRibbon, setShowRibbon] = useState(true);

  const panelRefs = useRef<Map<string, KLineChartPanelHandle>>(new Map());

  // ── Replay (synced across panels by cursor time) ──────────────────────
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

  // Load the default (or first) saved layout once — unless deep-linking a symbol.
  // With no saved layout, seed a default symbol so the home shows a real chart
  // (and the top bar / context dock agree with it).
  useEffect(() => {
    if (initialized.current || !layoutsQ.data || !symbolsQ.data) return;
    initialized.current = true;
    if (routeSymbol) return;
    const pick = layoutsQ.data.layouts.find((l) => l.isDefault) ?? layoutsQ.data.layouts[0];
    if (pick) {
      setConfig(pick.config);
      setCurrentId(pick.id);
      setCurrentName(pick.name);
      return;
    }
    const rows = symbolsQ.data.results;
    const def = rows.find((r) => r.ticker === 'BTCUSDT') ?? rows[0];
    if (def) setConfig(defaultLayoutConfig('1', def.id));
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
    setConfig((cfg) => {
      const idx = Math.min(cfg.activePanel, cfg.panels.length - 1);
      if (cfg.panels[idx]?.symbolId === found.id) return cfg;
      const panels = cfg.panels.map((p, i) => (i === idx ? { ...p, symbolId: found.id } : p));
      if (cfg.sync.symbol) return { ...cfg, panels: panels.map((p) => ({ ...p, symbolId: found.id })) };
      return { ...cfg, panels };
    });
  }, [routeSymbol, symbolsQ.data]);

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

  const setActiveInterval = useCallback((interval: Interval) => {
    setConfig((cfg) => {
      const idx = Math.min(cfg.activePanel, cfg.panels.length - 1);
      const panels = cfg.panels.map((p, i) => (i === idx ? { ...p, interval } : p));
      return { ...cfg, panels };
    });
  }, []);

  const persistDrawings = useCallback(async () => {
    for (const p of config.panels) {
      if (!p.symbolId) continue;
      const panelRef = panelRefs.current.get(p.id);
      if (!panelRef) continue;
      try {
        const drawings = panelRef.exportDrawings();
        if (drawings.length > 0) {
          await api.batchDrawings(p.symbolId, p.interval, { upsert: drawings }, p.drawingScopeId);
        }
      } catch {
        // individual drawing saves may fail; continue
      }
    }
  }, [config.panels]);

  const refreshLayouts = () => qc.invalidateQueries({ queryKey: ['layouts'] });

  const saveAs = async () => {
    const name = window.prompt('Layout name', currentName === 'Untitled' ? '' : currentName);
    if (!name) return;
    const { id } = await api.createLayout({ name, config });
    setCurrentId(id);
    setCurrentName(name);
    await persistDrawings();
    await refreshLayouts();
  };
  const save = async () => {
    if (!currentId) return saveAs();
    await api.updateLayout(currentId, { config, name: currentName });
    await persistDrawings();
    await refreshLayouts();
  };
  const deleteLayout = async () => {
    if (!currentId || !window.confirm(`Delete layout "${currentName}"?`)) return;
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
    setConfig(defaultLayoutConfig('1'));
    setCurrentId(null);
    setCurrentName('Untitled');
  };

  const activeIdx = Math.min(config.activePanel, config.panels.length - 1);
  const activePanel = config.panels[activeIdx];
  const activeSymbol = useMemo(() => {
    const rows = symbolsQ.data?.results ?? [];
    return activePanel?.symbolId ? rows.find((r) => r.id === activePanel.symbolId) ?? null : null;
  }, [symbolsQ.data, activePanel?.symbolId]);

  const preset = GRID_PRESETS[config.grid];
  const multiPanel = config.panels.length > 1;
  const gridOptions = useMemo(() => GRID_KEYS.map((g) => ({ value: g, label: g })), []);
  const intervalOptions = useMemo(() => INTERVALS.map((i) => ({ value: i, label: i })), []);

  return (
    <div className={`ws${showRibbon ? ' has-ribbon' : ''}`}>
      <div className="ws-bar">
        <span className="ws-symbol">
          {activeSymbol ? activeSymbol.ticker : '—'}
          {activeSymbol && <span>{activeSymbol.exchange}</span>}
        </span>

        <span className="ws-divider" />

        <Segmented value={config.grid} onChange={setGrid} options={gridOptions} />

        {activePanel && (
          <>
            <span className="ws-divider" />
            <Segmented
              value={activePanel.interval}
              onChange={setActiveInterval}
              options={intervalOptions}
            />
          </>
        )}

        <select
          value={currentId ?? ''}
          onChange={(e) => (e.target.value ? loadLayout(e.target.value) : newLayout())}
          style={{ width: 'auto', minWidth: 140 }}
          title="Saved layouts"
        >
          <option value="">＋ New layout</option>
          {layoutsQ.data?.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.isDefault ? ' ★' : ''}
            </option>
          ))}
        </select>

        {multiPanel && (
          <label className="ui-check">
            <input type="checkbox" checked={config.sync.symbol} onChange={toggleSync} /> sync
          </label>
        )}

        <span className="ws-divider" />

        <button
          className={replayActive ? 'primary sm' : 'sm'}
          onClick={() => (replayActive ? exitReplay() : enterReplay())}
          disabled={!replayDomain}
          title={replayDomain ? 'Bar replay' : 'Load a symbol to replay'}
        >
          Replay
        </button>
        {replayActive && (
          <>
            <button className="icon-btn" onClick={() => replayStep(-1)} title="Step back">
              <SkipBack size={14} />
            </button>
            <button className="icon-btn" onClick={replayTogglePlay} title={replayPlaying ? 'Pause' : 'Play'}>
              {replayPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="icon-btn" onClick={() => replayStep(1)} title="Step forward">
              <SkipForward size={14} />
            </button>
            <select
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
              style={{ width: 56 }}
            >
              {REPLAY_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            {replayCursor != null && (
              <span className="muted small mono">{new Date(replayCursor * 1000).toLocaleString()}</span>
            )}
          </>
        )}

        <span className="grow" />

        <button className="icon-btn" onClick={() => void save()} title="Save layout">
          <Save size={15} />
        </button>
        {currentId && (
          <button className="icon-btn" onClick={() => void deleteLayout()} title="Delete layout">
            <Trash2 size={15} />
          </button>
        )}
        <span className="ws-divider" />
        <button
          className="icon-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('tv:open-cmdk'))}
          title="Search (⌘K)"
        >
          <Search size={15} />
        </button>
        <button
          className={`icon-btn${showDock ? ' active' : ''}`}
          onClick={() => setShowDock((s) => !s)}
          title="Toggle side dock"
        >
          <PanelRight size={15} />
        </button>
        <button
          className={`icon-btn${showRibbon ? ' active' : ''}`}
          onClick={() => setShowRibbon((s) => !s)}
          title="Toggle news ribbon"
        >
          <PanelBottom size={15} />
        </button>
      </div>

      <div className={`ws-body${showDock ? ' with-dock' : ''}`}>
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
                onActivate={() => setConfig((cfg) => ({ ...cfg, activePanel: i }))}
                onChange={(patch) => updatePanel(i, patch)}
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
    </div>
  );
}
