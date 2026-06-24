import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import { ChartPanel } from '../components/ChartPanel';
import {
  GRID_KEYS,
  GRID_PRESETS,
  defaultLayoutConfig,
  reflowToGrid,
  type GridKey,
  type LayoutConfig,
  type Panel,
} from '@tv/layout-sync';
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';

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
  const initialized = useRef(false);
  const charts = useRef<Map<string, ChartRef>>(new Map());
  const [chartsVersion, setChartsVersion] = useState(0);

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
    setChartsVersion((v) => v + 1);
  }, []);

  // Crosshair sync: when the pointer moves over one chart, mirror the crosshair on the others.
  useEffect(() => {
    if (!config.sync.crosshair) return;
    const entries = [...charts.current.entries()];
    if (entries.length < 2) return;
    const handlers = entries.map(([id, src]) => {
      const handler = (param: { time?: Time; seriesData: Map<ISeriesApi<SeriesType>, unknown> }) => {
        for (const [otherId, dst] of entries) {
          if (otherId === id) continue;
          if (param.time === undefined) {
            dst.chart.clearCrosshairPosition();
            continue;
          }
          const d = param.seriesData.get(src.series) as { close?: number; value?: number } | undefined;
          const price = d?.close ?? d?.value;
          if (price !== undefined) dst.chart.setCrosshairPosition(price, param.time, dst.series);
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
      if (cfg.sync.interval && patch.interval !== undefined) {
        panels = panels.map((p) => ({ ...p, interval: patch.interval! }));
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
          <label className="layout-toggle"><input type="checkbox" checked={config.sync.interval} onChange={() => toggleSync('interval')} /> interval</label>
          <label className="layout-toggle"><input type="checkbox" checked={config.sync.crosshair} onChange={() => toggleSync('crosshair')} /> crosshair</label>
        </div>

        <span className="grow" />

        <button onClick={save} className="primary">Save</button>
        <button onClick={saveAs} className="ghost">Save as…</button>
        <button onClick={setDefault} className="ghost" disabled={!currentId}>Set default</button>
        <button onClick={del} className="ghost" disabled={!currentId}>Delete</button>
      </div>

      <div
        className="layout-grid"
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
            live={config.activePanel === i}
            onActivate={() => setConfig((cfg) => ({ ...cfg, activePanel: i }))}
            onChange={(patch) => updatePanel(i, patch)}
            onReady={onReady}
            onDestroy={onDestroy}
          />
        ))}
      </div>
    </div>
  );
}
