import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  BacktestResult,
  BacktestSettings,
  BacktestStats,
  BacktestTrade,
  StrategyDef,
  StrategyType,
} from '../api/types';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

const DEFAULT_SETTINGS: BacktestSettings = {
  initialCapital: 10_000,
  feeBps: 5,
  slippageBps: 2,
  allowShort: false,
  positionPct: 1,
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);

const formatPct = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

const formatDateTime = (time: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));

const strategyDefaults = (strategy?: StrategyDef): Record<string, number> => {
  const params: Record<string, number> = {};
  for (const p of strategy?.params ?? []) params[p.key] = p.default;
  return params;
};

function EquityChart({ result }: { result: BacktestResult }) {
  const eq = result.equityCurve;
  const st = result.stats;
  const minE = Math.min(st.initialCapital, ...eq.map((p) => p.equity));
  const maxE = Math.max(st.initialCapital, ...eq.map((p) => p.equity));
  const width = 900;
  const height = 220;
  const x = (i: number) => (eq.length > 1 ? (i / (eq.length - 1)) * width : 0);
  const y = (e: number) =>
    maxE > minE ? height - ((e - minE) / (maxE - minE)) * height : height / 2;
  const path = eq
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`)
    .join(' ');
  const zeroY = y(st.initialCapital);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <line
        x1={0}
        x2={width}
        y1={zeroY}
        y2={zeroY}
        stroke="#787b86"
        strokeWidth={0.75}
        strokeDasharray="4 4"
      />
      <path
        d={path}
        fill="none"
        stroke={st.netProfit >= 0 ? '#26a69a' : '#ef5350'}
        strokeWidth={2}
      />
    </svg>
  );
}

function DrawdownChart({ result }: { result: BacktestResult }) {
  let peak = result.stats.initialCapital;
  const points = result.equityCurve.map((p) => {
    peak = Math.max(peak, p.equity);
    return { time: p.time, drawdown: peak > 0 ? (peak - p.equity) / peak : 0 };
  });
  const width = 900;
  const height = 120;
  const maxD = Math.max(0.001, ...points.map((p) => p.drawdown));
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * width : 0);
  const y = (d: number) => (d / maxD) * height;
  const path = [
    `M0,0`,
    ...points.map((p, i) => `L${x(i).toFixed(1)},${y(p.drawdown).toFixed(1)}`),
    `L${width},0`,
    'Z',
  ].join(' ');

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <path d={path} fill="rgba(239,83,80,0.22)" stroke="#ef5350" strokeWidth={1.5} />
    </svg>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div className={`mono ${tone ?? ''}`} style={{ fontSize: 20, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const positive = trade.pnl >= 0;
  return (
    <tr>
      <td className={trade.side === 'long' ? 'up' : 'down'}>{trade.side}</td>
      <td className="mono">{formatDateTime(trade.entryTime)}</td>
      <td className="mono">{formatDateTime(trade.exitTime)}</td>
      <td className="mono">{formatMoney(trade.entryPrice)}</td>
      <td className="mono">{formatMoney(trade.exitPrice)}</td>
      <td className="mono">{trade.qty.toFixed(4)}</td>
      <td className={`mono ${positive ? 'up' : 'down'}`}>{formatMoney(trade.pnl)}</td>
      <td className={`mono ${positive ? 'up' : 'down'}`}>{formatPct(trade.pnlPct)}</td>
      <td className="mono">{trade.barsHeld}</td>
      <td className="muted">{trade.exitReason}</td>
    </tr>
  );
}

function StatsGrid({ stats }: { stats: BacktestStats }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      <StatCard
        label="Net profit"
        value={formatPct(stats.netProfitPct)}
        tone={stats.netProfit >= 0 ? 'up' : 'down'}
      />
      <StatCard label="Final equity" value={formatMoney(stats.finalEquity)} />
      <StatCard label="Buy & hold" value={formatPct(stats.buyHoldReturnPct)} />
      <StatCard label="Trades" value={`${stats.totalTrades}`} />
      <StatCard label="Win rate" value={`${(stats.winRate * 100).toFixed(0)}%`} />
      <StatCard
        label="Profit factor"
        value={stats.profitFactor == null ? '∞' : stats.profitFactor.toFixed(2)}
      />
      <StatCard
        label="Max drawdown"
        value={`-${(stats.maxDrawdownPct * 100).toFixed(1)}%`}
        tone="down"
      />
      <StatCard label="Sharpe / bar" value={stats.sharpe.toFixed(2)} />
      <StatCard label="Exposure" value={`${(stats.exposurePct * 100).toFixed(0)}%`} />
      <StatCard label="Avg bars held" value={stats.avgBarsHeld.toFixed(1)} />
    </div>
  );
}

export function BacktestsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState(1500);
  const [strategyType, setStrategyType] = useState<StrategyType>('maCross');
  const [params, setParams] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<BacktestSettings>(DEFAULT_SETTINGS);

  const strategiesQ = useQuery({
    queryKey: ['backtest-strategies'],
    queryFn: () => api.backtestStrategies(),
  });

  const currentStrategy = useMemo(
    () => strategiesQ.data?.strategies.find((s) => s.type === strategyType),
    [strategiesQ.data?.strategies, strategyType],
  );

  useEffect(() => {
    if (!currentStrategy) return;
    setParams((existing) => {
      const next = strategyDefaults(currentStrategy);
      for (const key of Object.keys(next)) {
        if (existing[key] != null) next[key] = existing[key];
      }
      return next;
    });
  }, [currentStrategy]);

  const runM = useMutation({
    mutationFn: () =>
      api.backtest(
        symbol.trim(),
        interval,
        { type: strategyType, params },
        settings,
        Math.max(100, Math.min(5000, Math.floor(limit))),
      ),
  });

  const result = runM.data?.result;
  const topTrades = result?.trades
    .slice()
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 5);

  const setSetting = (key: keyof BacktestSettings, value: number | boolean) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="page">
      <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div>
          <h1>Backtest reports</h1>
          <div className="muted small">
            Dedicated strategy report with equity, drawdown and trade audit.
          </div>
        </div>
        <span className="grow" />
        {runM.isPending && <span className="muted small">running…</span>}
      </div>

      <div className="backtests-shell">
        <section className="card col">
          <div>
            <label>Symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <label>Interval</label>
              <select value={interval} onChange={(e) => setInterval(e.target.value)}>
                {INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label>Bars</label>
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label>Strategy</label>
            <select
              value={strategyType}
              onChange={(e) => {
                const nextType = e.target.value as StrategyType;
                setStrategyType(nextType);
                setParams(
                  strategyDefaults(strategiesQ.data?.strategies.find((s) => s.type === nextType)),
                );
              }}
            >
              {(strategiesQ.data?.strategies ?? []).map((strategy) => (
                <option key={strategy.type} value={strategy.type}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </div>
          {currentStrategy && <div className="muted small">{currentStrategy.description}</div>}
          {currentStrategy?.params.map((p) => (
            <div key={p.key}>
              <label>{p.label}</label>
              <input
                type="number"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key] ?? p.default}
                onChange={(e) =>
                  setParams((current) => ({ ...current, [p.key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label>Capital</label>
              <input
                type="number"
                min={1}
                value={settings.initialCapital}
                onChange={(e) => setSetting('initialCapital', Number(e.target.value))}
              />
            </div>
            <div>
              <label>Position</label>
              <input
                type="number"
                min={0.01}
                max={1}
                step={0.05}
                value={settings.positionPct}
                onChange={(e) => setSetting('positionPct', Number(e.target.value))}
              />
            </div>
            <div>
              <label>Fee bps</label>
              <input
                type="number"
                min={0}
                value={settings.feeBps}
                onChange={(e) => setSetting('feeBps', Number(e.target.value))}
              />
            </div>
            <div>
              <label>Slippage bps</label>
              <input
                type="number"
                min={0}
                value={settings.slippageBps}
                onChange={(e) => setSetting('slippageBps', Number(e.target.value))}
              />
            </div>
          </div>
          <label className="row small" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.allowShort}
              onChange={(e) => setSetting('allowShort', e.target.checked)}
              style={{ width: 'auto' }}
            />
            Allow shorts
          </label>
          <button
            className="primary"
            disabled={!symbol.trim() || runM.isPending || strategiesQ.isLoading}
            onClick={() => runM.mutate()}
          >
            Run report
          </button>
          {runM.isError && <div className="down small">Backtest failed.</div>}
        </section>

        <section className="col" style={{ minWidth: 0 }}>
          {!result && (
            <div className="card muted">
              Run a strategy to generate a full report. Results use the same deterministic engine as
              the chart backtest panel.
            </div>
          )}

          {result && (
            <>
              <StatsGrid stats={result.stats} />

              <div className="card">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>Equity curve</div>
                  <span className="grow" />
                  <span className="muted small mono">
                    {formatDateTime(result.startTime)} → {formatDateTime(result.endTime)} ·{' '}
                    {result.barCount} bars
                  </span>
                </div>
                <EquityChart result={result} />
              </div>

              <div className="card">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>Drawdown</div>
                  <span className="grow" />
                  <span className="down small mono">
                    max -{(result.stats.maxDrawdownPct * 100).toFixed(1)}%
                  </span>
                </div>
                <DrawdownChart result={result} />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                <div className="card col">
                  <div style={{ fontWeight: 600 }}>Trade summary</div>
                  <div className="row small">
                    <span className="muted">Gross profit</span>
                    <span className="grow" />
                    <span className="mono up">{formatMoney(result.stats.grossProfit)}</span>
                  </div>
                  <div className="row small">
                    <span className="muted">Gross loss</span>
                    <span className="grow" />
                    <span className="mono down">{formatMoney(result.stats.grossLoss)}</span>
                  </div>
                  <div className="row small">
                    <span className="muted">Average trade</span>
                    <span className="grow" />
                    <span className={`mono ${result.stats.avgTrade >= 0 ? 'up' : 'down'}`}>
                      {formatMoney(result.stats.avgTrade)}
                    </span>
                  </div>
                  <div className="row small">
                    <span className="muted">Long / short</span>
                    <span className="grow" />
                    <span className="mono">
                      {result.stats.longTrades} / {result.stats.shortTrades}
                    </span>
                  </div>
                </div>

                <div className="card col">
                  <div style={{ fontWeight: 600 }}>Largest moves</div>
                  {topTrades?.map((trade, index) => (
                    <div
                      key={`${trade.entryTime}-${trade.exitTime}-${index}`}
                      className="row small"
                    >
                      <span className={trade.side === 'long' ? 'up' : 'down'}>{trade.side}</span>
                      <span className="muted mono">{formatDateTime(trade.entryTime)}</span>
                      <span className="grow" />
                      <span className={`mono ${trade.pnl >= 0 ? 'up' : 'down'}`}>
                        {formatMoney(trade.pnl)}
                      </span>
                    </div>
                  ))}
                  {topTrades?.length === 0 && <div className="muted small">No closed trades.</div>}
                </div>
              </div>

              <div className="card">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>Trades</div>
                  <span className="grow" />
                  <span className="muted small">{result.trades.length} round trips</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="discovery-table">
                    <thead>
                      <tr>
                        <th>Side</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>Entry px</th>
                        <th>Exit px</th>
                        <th>Qty</th>
                        <th>P&L</th>
                        <th>Return</th>
                        <th>Bars</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((trade, index) => (
                        <TradeRow
                          key={`${trade.entryTime}-${trade.exitTime}-${index}`}
                          trade={trade}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.trades.length === 0 && (
                  <div className="muted small">No trades matched these settings.</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
