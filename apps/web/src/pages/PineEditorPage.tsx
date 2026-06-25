import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import { registerPine } from '../lib/monaco-pine';
import { SymbolSearch } from '../components/SymbolSearch';
import { createTvChart, addSeries, setData, removeChart, darkTheme } from '@tv/chart-engine';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { PineRunResult } from '@tv/pine-runtime';
import type { BacktestResult } from '../api/types';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;

const EXAMPLE = `//@version=5
indicator("Demo: SMA + RSI", overlay=true)
fast = ta.sma(close, 10)
slow = ta.sma(close, 30)
plot(fast, title="SMA 10", color=color.blue)
plot(slow, title="SMA 30", color=color.orange)
`;

const toLineData = (data: (number | null)[], times: number[]) => {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v !== null && v !== undefined) out.push({ time: times[i] as UTCTimestamp, value: v });
  }
  return out;
};

export function PineEditorPage() {
  const { user } = useAuth();
  const [source, setSource] = useState(EXAMPLE);
  const [symbolId, setSymbolId] = useState<string | null>(null);
  const [symbolLabel, setSymbolLabel] = useState<string>('');
  const [interval, setInterval] = useState<string>('1h');
  const [result, setResult] = useState<PineRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [validateMsg, setValidateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [btResult, setBtResult] = useState<{ result: BacktestResult; signalPlot: string } | null>(
    null,
  );
  const [btError, setBtError] = useState<string | null>(null);
  const [btRunning, setBtRunning] = useState(false);
  const [allowShort, setAllowShort] = useState(false);

  const priceRef = useRef<HTMLDivElement>(null);
  const oscRef = useRef<HTMLDivElement>(null);
  const priceChart = useRef<IChartApi | null>(null);
  const oscChart = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const pineSeries = useRef<ISeriesApi<SeriesType>[]>([]);

  const historyQ = useQuery({
    queryKey: ['pine-history', symbolId, interval],
    queryFn: () => api.history(symbolId!, interval, 500),
    enabled: !!symbolId,
  });

  // Price chart lifecycle.
  useEffect(() => {
    if (!priceRef.current) return;
    const chart = createTvChart({ container: priceRef.current, theme: darkTheme, autoSize: true });
    priceChart.current = chart;
    candleRef.current = addSeries(chart, 'candles');
    return () => {
      removeChart(chart);
      priceChart.current = null;
      candleRef.current = null;
      pineSeries.current = [];
    };
  }, []);

  // Draw candles when history loads.
  useEffect(() => {
    if (!candleRef.current || !historyQ.data) return;
    setData(
      candleRef.current,
      historyQ.data.bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    priceChart.current?.timeScale().fitContent();
  }, [historyQ.data]);

  // Draw the script's plots whenever a run result arrives.
  useEffect(() => {
    // clear previously drawn pine series
    for (const s of pineSeries.current) {
      try { priceChart.current?.removeSeries(s); } catch { /* may live on osc chart */ }
      try { oscChart.current?.removeSeries(s); } catch { /* ignore */ }
    }
    pineSeries.current = [];
    if (!result) return;

    const overlay = result.overlay;
    if (overlay) {
      if (!priceChart.current) return;
      for (const p of result.plots) {
        const s = addSeries(priceChart.current, 'line', { color: p.color, lineWidth: 2 });
        setData(s, toLineData(p.data, result.times));
        pineSeries.current.push(s);
      }
    } else {
      if (!oscRef.current) return;
      if (!oscChart.current) oscChart.current = createTvChart({ container: oscRef.current, theme: darkTheme, autoSize: true });
      for (const p of result.plots) {
        const s = addSeries(oscChart.current, 'line', { color: p.color, lineWidth: 2 });
        setData(s, toLineData(p.data, result.times));
        pineSeries.current.push(s);
      }
      oscChart.current.timeScale().fitContent();
    }
  }, [result]);

  // Validate on edit (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const v = await api.pineValidate(source);
        setValidateMsg(v.ok ? { ok: true, text: `OK · ${v.meta?.title ?? ''}` } : { ok: false, text: `${v.error?.kind}: ${v.error?.message}` });
      } catch {
        /* network hiccup — leave previous status */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [source]);

  const run = useCallback(async () => {
    if (!symbolId) { setRunError('Pick a symbol first'); return; }
    setRunning(true);
    setRunError(null);
    try {
      const res = await api.pineRun({ source, symbol: symbolId, interval, limit: 500 });
      if (res.ok) { setResult(res.result); }
      else { setRunError(`${res.error.kind}: ${res.error.message}`); setResult(null); }
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [source, symbolId, interval]);

  const backtest = useCallback(async () => {
    if (!symbolId) { setBtError('Pick a symbol first'); return; }
    setBtRunning(true);
    setBtError(null);
    try {
      const res = await api.backtestPine({
        source,
        symbol: symbolId,
        interval,
        limit: 1000,
        settings: { allowShort },
      });
      if (res.ok) setBtResult({ result: res.result, signalPlot: res.signalPlot });
      else { setBtError(`${res.error.kind}: ${res.error.message}`); setBtResult(null); }
    } catch (e) {
      setBtError((e as Error).message);
    } finally {
      setBtRunning(false);
    }
  }, [source, symbolId, interval, allowShort]);

  if (!user) {
    return <div className="page"><p>You need to <Link to="/login">log in</Link> to use the Pine editor.</p></div>;
  }

  return (
    <div className="pine-page">
      <div className="pine-toolbar">
        <strong>Pine editor</strong>
        <span className="layout-divider" />
        {symbolLabel && <span className="mono small">{symbolLabel}</span>}
        <div style={{ width: 220 }}>
          <SymbolSearch
            placeholder="Search symbol…"
            onSelect={(s) => { setSymbolId(s.id); setSymbolLabel(`${s.exchange}:${s.ticker}`); }}
          />
        </div>
        <select value={interval} onChange={(e) => setInterval(e.target.value)} style={{ width: 72 }}>
          {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <button className="primary" onClick={run} disabled={running || !symbolId}>{running ? 'Running…' : '▶ Run'}</button>
        <label className="layout-toggle" title="Allow short positions in the backtest">
          <input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)} /> shorts
        </label>
        <button onClick={backtest} disabled={btRunning || !symbolId} title="Backtest the script's signal plot (titled “signal”, else the first plot)">
          {btRunning ? 'Backtesting…' : '⚗ Backtest'}
        </button>
        {validateMsg && <span className={`small ${validateMsg.ok ? 'up' : 'down'}`}>{validateMsg.text}</span>}
        <span className="grow" />
        {result && <span className="muted small">{result.plots.length} plots · {result.inputs.length} inputs · {result.overlay ? 'overlay' : 'separate pane'}</span>}
      </div>

      <div className="pine-body">
        <div className="pine-editor">
          <Editor
            height="100%"
            language="pine"
            theme="vs-dark"
            value={source}
            onChange={(v) => setSource(v ?? '')}
            beforeMount={(m) => registerPine(m)}
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
          />
        </div>
        <div className="pine-charts">
          <div ref={priceRef} className="pine-chart" />
          {result && !result.overlay && <div ref={oscRef} className="pine-chart pine-chart-osc" />}
          {runError && <div className="pine-error">{runError}</div>}
          {btError && <div className="pine-error">{btError}</div>}
          {btResult &&
            (() => {
              const r = btResult.result;
              const st = r.stats;
              const eq = r.equityCurve;
              const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
              const minE = Math.min(st.initialCapital, ...eq.map((p) => p.equity));
              const maxE = Math.max(st.initialCapital, ...eq.map((p) => p.equity));
              const W = 260;
              const H = 64;
              const x = (i: number) => (eq.length > 1 ? (i / (eq.length - 1)) * W : 0);
              const y = (e: number) =>
                maxE > minE ? H - ((e - minE) / (maxE - minE)) * H : H / 2;
              const path = eq
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`)
                .join(' ');
              const up = st.netProfit >= 0;
              const chip = (label: string, value: string, cls = '') => (
                <div className="col" style={{ gap: 0, minWidth: 92 }}>
                  <span className="muted small">{label}</span>
                  <span className={`mono ${cls}`}>{value}</span>
                </div>
              );
              return (
                <div
                  className="card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
                >
                  <div className="row">
                    <strong>Backtest</strong>
                    <span className="grow" />
                    <span className="muted small">
                      signal: <span className="mono">{btResult.signalPlot}</span> · {st.totalTrades}{' '}
                      trades
                    </span>
                  </div>
                  <svg
                    width="100%"
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    style={{ display: 'block' }}
                  >
                    <line
                      x1={0}
                      x2={W}
                      y1={y(st.initialCapital)}
                      y2={y(st.initialCapital)}
                      stroke="#787b86"
                      strokeWidth={0.5}
                      strokeDasharray="3 3"
                    />
                    <path d={path} fill="none" stroke={up ? '#26a69a' : '#ef5350'} strokeWidth={1.5} />
                  </svg>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
                    {chip('Net profit', pct(st.netProfitPct), up ? 'up' : 'down')}
                    {chip('Buy & hold', pct(st.buyHoldReturnPct))}
                    {chip('Win rate', `${(st.winRate * 100).toFixed(0)}%`)}
                    {chip(
                      'Profit factor',
                      st.profitFactor == null ? '∞' : st.profitFactor.toFixed(2),
                    )}
                    {chip('Max DD', `-${(st.maxDrawdownPct * 100).toFixed(1)}%`, 'down')}
                    {chip('Sharpe', st.sharpe.toFixed(2))}
                    {chip('Exposure', `${(st.exposurePct * 100).toFixed(0)}%`)}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
