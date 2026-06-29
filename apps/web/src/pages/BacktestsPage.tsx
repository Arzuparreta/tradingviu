import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { api } from '../api/client';
import type {
  BacktestResult,
  BacktestSettings,
  BacktestStats,
  BacktestTrade,
  StrategyDef,
  StrategyType,
} from '../api/types';
import { Card, EmptyState, Field, PageHeader, Stat } from '../ui';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

const DEFAULT_SETTINGS: BacktestSettings = {
  initialCapital: 10_000,
  feeBps: 5,
  slippageBps: 2,
  allowShort: false,
  positionPct: 1,
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);

const formatPct = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

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
  const y = (e: number) => (maxE > minE ? height - ((e - minE) / (maxE - minE)) * height : height / 2);
  const path = eq.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const zeroY = y(st.initialCapital);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth={0.75} strokeDasharray="4 4" />
      <path d={path} fill="none" stroke={st.netProfit >= 0 ? 'var(--up)' : 'var(--down)'} strokeWidth={2} />
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
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={path} fill="var(--down-soft)" stroke="var(--down)" strokeWidth={1.5} />
    </svg>
  );
}

function StatsGrid({ stats }: { stats: BacktestStats }) {
  const items: { label: string; value: ReactNode }[] = [
    { label: 'Net profit', value: <span className={stats.netProfit >= 0 ? 'up' : 'down'}>{formatPct(stats.netProfitPct)}</span> },
    { label: 'Final equity', value: formatMoney(stats.finalEquity) },
    { label: 'Buy & hold', value: formatPct(stats.buyHoldReturnPct) },
    { label: 'Trades', value: String(stats.totalTrades) },
    { label: 'Win rate', value: `${(stats.winRate * 100).toFixed(0)}%` },
    { label: 'Profit factor', value: stats.profitFactor == null ? '∞' : stats.profitFactor.toFixed(2) },
    { label: 'Max drawdown', value: <span className="down">-{(stats.maxDrawdownPct * 100).toFixed(1)}%</span> },
    { label: 'Sharpe / bar', value: stats.sharpe.toFixed(2) },
    { label: 'Exposure', value: `${(stats.exposurePct * 100).toFixed(0)}%` },
    { label: 'Avg bars held', value: stats.avgBarsHeld.toFixed(1) },
  ];
  return (
    <Card>
      <div className="opt-stats">
        {items.map((it) => (
          <Stat key={it.label} label={it.label} value={it.value} />
        ))}
      </div>
    </Card>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const positive = trade.pnl >= 0;
  return (
    <tr>
      <td>
        <span className={trade.side === 'long' ? 'up' : 'down'}>{trade.side}</span>
      </td>
      <td className="muted">{formatDateTime(trade.entryTime)}</td>
      <td className="muted">{formatDateTime(trade.exitTime)}</td>
      <td className="num">{formatMoney(trade.entryPrice)}</td>
      <td className="num">{formatMoney(trade.exitPrice)}</td>
      <td className="num">{trade.qty.toFixed(4)}</td>
      <td className={`num ${positive ? 'up' : 'down'}`}>{formatMoney(trade.pnl)}</td>
      <td className={`num ${positive ? 'up' : 'down'}`}>{formatPct(trade.pnlPct)}</td>
      <td className="num">{trade.barsHeld}</td>
      <td className="muted">{trade.exitReason}</td>
    </tr>
  );
}

export function BacktestsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState(1500);
  const [strategyType, setStrategyType] = useState<StrategyType>('maCross');
  const [params, setParams] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<BacktestSettings>(DEFAULT_SETTINGS);

  const strategiesQ = useQuery({ queryKey: ['backtest-strategies'], queryFn: () => api.backtestStrategies() });

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
    <div className="page ui-page">
      <PageHeader
        title="Backtest reports"
        subtitle="Equity, drawdown and trade audit on the deterministic engine"
        actions={runM.isPending ? <span className="muted small">running…</span> : null}
      />
      <div className="split">
        <Card title="Settings" icon={<FlaskConical size={13} />}>
          <div className="col">
            <Field label="Symbol">
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            </Field>
            <div className="ui-field-row">
              <Field label="Interval">
                <select value={interval} onChange={(e) => setInterval(e.target.value)}>
                  {INTERVALS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bars">
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Strategy">
              <select
                value={strategyType}
                onChange={(e) => {
                  const nextType = e.target.value as StrategyType;
                  setStrategyType(nextType);
                  setParams(strategyDefaults(strategiesQ.data?.strategies.find((s) => s.type === nextType)));
                }}
              >
                {(strategiesQ.data?.strategies ?? []).map((strategy) => (
                  <option key={strategy.type} value={strategy.type}>
                    {strategy.label}
                  </option>
                ))}
              </select>
            </Field>
            {currentStrategy && <p className="muted small">{currentStrategy.description}</p>}
            {currentStrategy?.params.map((p) => (
              <Field key={p.key} label={p.label}>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={params[p.key] ?? p.default}
                  onChange={(e) => setParams((current) => ({ ...current, [p.key]: Number(e.target.value) }))}
                />
              </Field>
            ))}
            <div className="ui-field-row">
              <Field label="Capital">
                <input type="number" min={1} value={settings.initialCapital} onChange={(e) => setSetting('initialCapital', Number(e.target.value))} />
              </Field>
              <Field label="Position">
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.05}
                  value={settings.positionPct}
                  onChange={(e) => setSetting('positionPct', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="ui-field-row">
              <Field label="Fee bps">
                <input type="number" min={0} value={settings.feeBps} onChange={(e) => setSetting('feeBps', Number(e.target.value))} />
              </Field>
              <Field label="Slippage bps">
                <input type="number" min={0} value={settings.slippageBps} onChange={(e) => setSetting('slippageBps', Number(e.target.value))} />
              </Field>
            </div>
            <label className="ui-check">
              <input type="checkbox" checked={settings.allowShort} onChange={(e) => setSetting('allowShort', e.target.checked)} />
              Allow shorts
            </label>
            <button
              className="primary"
              disabled={!symbol.trim() || runM.isPending || strategiesQ.isLoading}
              onClick={() => runM.mutate()}
            >
              Run report
            </button>
            {runM.isError && <p className="down small">Backtest failed.</p>}
          </div>
        </Card>

        <div className="col" style={{ minWidth: 0 }}>
          {!result ? (
            <Card>
              <EmptyState
                icon={<FlaskConical size={20} />}
                title="No report yet"
                hint="Run a strategy to generate a full equity, drawdown and trade report."
              />
            </Card>
          ) : (
            <>
              <StatsGrid stats={result.stats} />

              <Card
                title="Equity curve"
                action={
                  <span className="muted small mono">
                    {formatDateTime(result.startTime)} → {formatDateTime(result.endTime)} · {result.barCount} bars
                  </span>
                }
              >
                <EquityChart result={result} />
              </Card>

              <Card
                title="Drawdown"
                action={<span className="down small mono">max -{(result.stats.maxDrawdownPct * 100).toFixed(1)}%</span>}
              >
                <DrawdownChart result={result} />
              </Card>

              <div className="bt-cols">
                <Card title="Trade summary">
                  <div className="opt-greek">
                    <span className="muted">Gross profit</span>
                    <span className="mono up">{formatMoney(result.stats.grossProfit)}</span>
                  </div>
                  <div className="opt-greek">
                    <span className="muted">Gross loss</span>
                    <span className="mono down">{formatMoney(result.stats.grossLoss)}</span>
                  </div>
                  <div className="opt-greek">
                    <span className="muted">Average trade</span>
                    <span className={`mono ${result.stats.avgTrade >= 0 ? 'up' : 'down'}`}>{formatMoney(result.stats.avgTrade)}</span>
                  </div>
                  <div className="opt-greek">
                    <span className="muted">Long / short</span>
                    <span className="mono">
                      {result.stats.longTrades} / {result.stats.shortTrades}
                    </span>
                  </div>
                </Card>

                <Card title="Largest moves">
                  {topTrades && topTrades.length > 0 ? (
                    topTrades.map((trade, index) => (
                      <div key={`${trade.entryTime}-${trade.exitTime}-${index}`} className="opt-greek">
                        <span>
                          <span className={trade.side === 'long' ? 'up' : 'down'}>{trade.side}</span>{' '}
                          <span className="muted mono">{formatDateTime(trade.entryTime)}</span>
                        </span>
                        <span className={`mono ${trade.pnl >= 0 ? 'up' : 'down'}`}>{formatMoney(trade.pnl)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="muted small">No closed trades.</p>
                  )}
                </Card>
              </div>

              <Card title={`Trades · ${result.trades.length} round trips`} flush>
                {result.trades.length === 0 ? (
                  <EmptyState icon={<FlaskConical size={20} />} title="No trades matched these settings" />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Side</th>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th className="num">Entry px</th>
                          <th className="num">Exit px</th>
                          <th className="num">Qty</th>
                          <th className="num">P&amp;L</th>
                          <th className="num">Return</th>
                          <th className="num">Bars</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((trade, index) => (
                          <TradeRow key={`${trade.entryTime}-${trade.exitTime}-${index}`} trade={trade} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
