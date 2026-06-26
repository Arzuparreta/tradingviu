import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import { ChartPanel, type PanelBounds } from '../components/ChartPanel';
import { DEFAULT_DRAWING_STYLE, type DrawingStyle, type DrawingTool } from '@tv/drawing-tools';
import {
  REPLAY_SPEEDS,
  replayStepMs,
  clampTime,
  defaultReplayTime,
  isTimeAtEnd,
} from '../lib/replay';
import {
  GRID_KEYS,
  GRID_PRESETS,
  defaultLayoutConfig,
  reflowToGrid,
  type GridKey,
  type LayoutConfig,
  type Panel,
} from '@tv/layout-sync';
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';

interface ChartRef {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
}

export function LayoutPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<LayoutConfig>(() => defaultLayoutConfig('1'));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>('Untitled');
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('cursor');
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle>(DEFAULT_DRAWING_STYLE);
  const [deleteDrawingRequest, setDeleteDrawingRequest] = useState(0);
  const initialized = useRef(false);
  const charts = useRef<Map<string, ChartRef>>(new Map());
  const [chartsVersion, setChartsVersion] = useState(0);

  // --- Multi-chart Bar Replay (synced by cursor *time*, not bar index) ---
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

  // Global time domain across every loaded panel: union of spans, finest step.
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
    // recomputed whenever a panel reports new bounds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsVersion]);

  const layoutsQ = useQuery({ queryKey: ['layouts'], queryFn: () => api.layouts(), enabled: !!user });

  // Load the default (or first) saved layout once on mount.
  useEffect(() => {
    if (initialized.current || !layoutsQ.data) return;
    initialized.current = true;
    const rows = layoutsQ.data.layouts;
    const pick = rows.find((l) => l.isDefault) ?? rows[0];
    if (pick) {
      setConfig(pick.config);
      setCurrentId(pick.id);
      setCurrentName(pick.name);
    }
  }, [layoutsQ.data]);

  const onReady = useCallback((id: string, chart: IChartApi, series: ISeriesApi<SeriesType>) => {
    charts.current.set(id, { chart, series });
    setChartsVersion((v) => v + 1);
  }, []);
  const onDestroy = useCallback((id: string) => {
    charts.current.delete(id);
    bounds.current.delete(id);
    setChartsVersion((v) => v + 1);
    setBoundsVersion((v) => v + 1);
  }, []);

  // Advance the shared cursor while playing; cadence is the speed multiplier.
  // (`setInterval` is fine here — not shadowed in this component.)
  useEffect(() => {
    if (!replayActive || !replayPlaying || !replayDomain) return;
    const { min, max, step } = replayDomain;
    const id = window.setInterval(() => {
      setReplayCursor((t) => clampTime((t ?? min) + step, min, max));
    }, replayStepMs(replaySpeed));
    return () => window.clearInterval(id);
  }, [replayActive, replayPlaying, replaySpeed, replayDomain]);

  // Stop playback when the cursor reaches the end of the global span.
  useEffect(() => {
    if (replayPlaying && replayDomain && replayCursor != null && isTimeAtEnd(replayCursor, replayDomain.max)) {
      setReplayPlaying(false);
    }
  }, [replayPlaying, replayCursor, replayDomain]);

  // Keep the cursor inside the domain as panels load / the layout changes.
  useEffect(() => {
    if (!replayActive || !replayDomain) return;
    setReplayCursor((t) =>
      t == null ? defaultReplayTime(replayDomain.min, replayDomain.max) : clampTime(t, replayDomain.min, replayDomain.max),
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

  // Crosshair sync: when the pointer moves over one chart, mirror the crosshair on the others.
  useEffect(() => {
    if (!config.sync.crosshair) return;
    const entries = [...charts.current.entries()];
    if (entries.length < 2) return;
    const handlers = entries.map(([id, src]) => {
      const handler = (param: MouseEventParams<Time>) => {
        for (const [otherId, dst] of entries) {
          if (otherId === id) continue;
          if (param.time === undefined || param.point === undefined) {
            dst.chart.clearCrosshairPosition();
            continue;
          }
          const price = src.series.coordinateToPrice(param.point.y);
          if (price !== null) dst.chart.setCrosshairPosition(price, param.time, dst.series);
        }
      };
      src.chart.subscribeCrosshairMove(handler as never);
      return { chart: src.chart, handler };
    });
    return () => {
      for (const { chart, handler } of handlers) chart.unsubscribeCrosshairMove(handler as never);
    };
  }, [config.sync.crosshair, chartsVersion]);

  const setGrid = (grid: GridKey) => setConfig((cfg) => reflowToGrid(cfg, grid));

  const updatePanel = useCallback((idx: number, patch: Partial<Panel>) => {
    setConfig((cfg) => {
      let panels = cfg.panels.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      if (cfg.sync.symbol && patch.symbolId !== undefined) {
        panels = panels.map((p) => ({ ...p, symbolId: patch.symbolId! }));
      }
      return { ...cfg, panels };
    });
  }, []);

  const toggleSync = (key: keyof LayoutConfig['sync']) =>
    setConfig((cfg) => ({ ...cfg, sync: { ...cfg.sync, [key]: !cfg.sync[key] } }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['layouts'] });

  const saveAs = async () => {
    const name = window.prompt('Layout name', currentName === 'Untitled' ? '' : currentName);
    if (!name) return;
    const { id } = await api.createLayout({ name, config });
    setCurrentId(id);
    setCurrentName(name);
    await refresh();
  };
  const save = async () => {
    if (!currentId) return saveAs();
    await api.updateLayout(currentId, { config, name: currentName });
    await refresh();
  };
  const setDefault = async () => {
    if (!currentId) return;
    await api.updateLayout(currentId, { isDefault: true });
    await refresh();
  };
  const del = async () => {
    if (!currentId || !window.confirm(`Delete layout "${currentName}"?`)) return;
    await api.deleteLayout(currentId);
    setCurrentId(null);
    setCurrentName('Untitled');
    setConfig(defaultLayoutConfig('1'));
    await refresh();
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

  if (!user) {
    return (
      <div className="page">
        <p>You need to <Link to="/login">log in</Link> to use layouts.</p>
      </div>
    );
  }

  const preset = GRID_PRESETS[config.grid];
  const showMousePanelIndicator = config.panels.length > 1;

  return (
    <div className="layout-page">
      <div className="layout-toolbar">
        <select value={currentId ?? ''} onChange={(e) => (e.target.value ? loadLayout(e.target.value) : newLayout())}>
          <option value="">＋ New layout</option>
          {layoutsQ.data?.layouts.map((l) => (
            <option key={l.id} value={l.id}>{l.name}{l.isDefault ? ' ★' : ''}</option>
          ))}
        </select>

        <span className="layout-divider" />

        <div className="row" style={{ gap: 4 }}>
          {GRID_KEYS.map((g) => (
            <button
              key={g}
              className={config.grid === g ? 'primary' : 'ghost'}
              onClick={() => setGrid(g)}
              title={GRID_PRESETS[g].label}
              style={{ padding: '4px 10px' }}
            >
              {g}
            </button>
          ))}
        </div>

        <span className="layout-divider" />

        <div className="row" style={{ gap: 10 }}>
          <label className="layout-toggle"><input type="checkbox" checked={config.sync.symbol} onChange={() => toggleSync('symbol')} /> symbol</label>
          <label className="layout-toggle"><input type="checkbox" checked={config.sync.crosshair} onChange={() => toggleSync('crosshair')} /> crosshair</label>
        </div>

        <span className="layout-divider" />

        <div className="drawing-toolbar">
          {([
            ['cursor', 'Cursor'],
            ['select', 'Select'],
            ['trend-line', 'Line'],
            ['ray', 'Ray'],
            ['extended-line', 'Extend'],
            ['horizontal-line', 'H'],
            ['vertical-line', 'V'],
            ['rectangle', 'Rect'],
            ['text', 'Text'],
          ] as const).map(([tool, label]) => (
            <button
              key={tool}
              className={drawingTool === tool ? 'primary' : 'ghost'}
              onClick={() => setDrawingTool(tool)}
              title={label}
              style={{ padding: '4px 8px' }}
            >
              {label}
            </button>
          ))}
          <input
            type="color"
            value={drawingStyle.color}
            onChange={(e) => setDrawingStyle((s) => ({ ...s, color: e.target.value }))}
            title="Drawing color"
          />
          <select
            value={drawingStyle.lineStyle}
            onChange={(e) => setDrawingStyle((s) => ({ ...s, lineStyle: e.target.value as DrawingStyle['lineStyle'] }))}
            title="Line style"
          >
            <option value="solid">solid</option>
            <option value="dashed">dash</option>
            <option value="dotted">dot</option>
          </select>
          <select
            value={drawingStyle.width}
            onChange={(e) => setDrawingStyle((s) => ({ ...s, width: Number(e.target.value) }))}
            title="Line width"
          >
            {[1, 2, 3, 4, 5, 6].map((w) => <option key={w} value={w}>{w}px</option>)}
          </select>
          <button className="ghost" onClick={() => setDeleteDrawingRequest((n) => n + 1)} title="Delete selected drawing">Delete</button>
        </div>

        <span className="layout-divider" />

        <div className="row" style={{ gap: 4 }}>
          <button
            className={replayActive ? 'primary' : 'ghost'}
            onClick={() => (replayActive ? exitReplay() : enterReplay())}
            disabled={!replayDomain}
            title={replayDomain ? 'Bar replay (all charts)' : 'Add a symbol to replay'}
            style={{ padding: '4px 10px' }}
          >
            Replay
          </button>
          {replayActive && (
            <>
              <button className="ghost" onClick={() => replayStep(-1)} title="Step back" style={{ padding: '4px 8px' }}>⏮</button>
              <button className="ghost" onClick={replayTogglePlay} title={replayPlaying ? 'Pause' : 'Play'} style={{ padding: '4px 8px' }}>
                {replayPlaying ? '⏸' : '▶'}
              </button>
              <button className="ghost" onClick={() => replayStep(1)} title="Step forward" style={{ padding: '4px 8px' }}>⏭</button>
              <select value={replaySpeed} onChange={(e) => setReplaySpeed(Number(e.target.value))} style={{ width: 56 }}>
                {REPLAY_SPEEDS.map((s) => (
                  <option key={s} value={s}>{s}×</option>
                ))}
              </select>
              {replayCursor != null && (
                <span className="muted small mono">{new Date(replayCursor * 1000).toLocaleString()}</span>
              )}
            </>
          )}
        </div>

        <span className="grow" />

        <button onClick={save} className="primary">Save</button>
        <button onClick={saveAs} className="ghost">Save as…</button>
        <button onClick={setDefault} className="ghost" disabled={!currentId}>Set default</button>
        <button onClick={del} className="ghost" disabled={!currentId}>Delete</button>
      </div>

      <div
        className={`layout-grid${showMousePanelIndicator ? ' multi-panel' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${preset.cols}, 1fr)`,
          gridTemplateRows: `repeat(${preset.rows}, 1fr)`,
        }}
      >
        {config.panels.map((p, i) => (
          <ChartPanel
            key={p.id}
            panel={p}
            active={config.activePanel === i}
            live={config.activePanel === i && !replayActive}
            drawingTool={drawingTool}
            drawingStyle={drawingStyle}
            deleteDrawingRequest={deleteDrawingRequest}
            onActivate={() => setConfig((cfg) => ({ ...cfg, activePanel: i }))}
            onChange={(patch) => updatePanel(i, patch)}
            onReady={onReady}
            onDestroy={onDestroy}
            replayActive={replayActive}
            replayCursor={replayActive ? replayCursor : null}
            onBounds={onBounds}
          />
        ))}
      </div>
    </div>
  );
}
