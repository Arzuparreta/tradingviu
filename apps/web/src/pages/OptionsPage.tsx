import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sigma } from 'lucide-react';
import { api } from '../api/client';
import type { StrategyAnalysis, StrategyTemplate } from '../api/types';
import { Card, EmptyState, Field, PageHeader, Stat } from '../ui';

const TEMPLATES: { value: StrategyTemplate; label: string }[] = [
  { value: 'long_call', label: 'Long Call' },
  { value: 'long_put', label: 'Long Put' },
  { value: 'short_call', label: 'Short Call' },
  { value: 'short_put', label: 'Short Put' },
  { value: 'bull_call_spread', label: 'Bull Call Spread' },
  { value: 'bear_call_spread', label: 'Bear Call Spread' },
  { value: 'bull_put_spread', label: 'Bull Put Spread' },
  { value: 'bear_put_spread', label: 'Bear Put Spread' },
  { value: 'straddle', label: 'Long Straddle' },
  { value: 'strangle', label: 'Long Strangle' },
  { value: 'iron_condor', label: 'Iron Condor' },
  { value: 'iron_butterfly', label: 'Iron Butterfly' },
  { value: 'call_butterfly', label: 'Call Butterfly' },
];

const fmt = (n: number, dp = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

function PayoffChart({ analysis, spot }: { analysis: StrategyAnalysis; spot: number }) {
  const { path, zeroY, spotX, beMarks, W, H } = useMemo(() => {
    const W = 600;
    const H = 260;
    const pad = 36;
    const pts = analysis.payoff;
    const xs = pts.map((p) => p.price);
    const ys = pts.map((p) => p.pnl);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(0, ...ys);
    const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - 2 * pad);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.price).toFixed(1)},${sy(p.pnl).toFixed(1)}`).join(' ');
    return {
      W,
      H,
      zeroY: sy(0),
      spotX: spot >= minX && spot <= maxX ? sx(spot) : null,
      beMarks: analysis.breakevens.filter((b) => b >= minX && b <= maxX).map((b) => ({ x: sx(b), v: b })),
      path,
    };
  }, [analysis, spot]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 'var(--radius)' }}
    >
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-strong)" strokeWidth={1} />
      {spotX !== null && (
        <line x1={spotX} y1={8} x2={spotX} y2={H - 8} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 4" />
      )}
      {beMarks.map((m, i) => (
        <g key={i}>
          <line x1={m.x} y1={8} x2={m.x} y2={H - 8} stroke="var(--warn)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={m.x + 3} y={18} fill="var(--warn)" fontSize={10}>
            {fmt(m.v)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--up)" strokeWidth={2} />
    </svg>
  );
}

const greekRow = (label: string, value: number, dp = 4) => (
  <div className="opt-greek">
    <span className="muted">{label}</span>
    <span className="mono">{fmt(value, dp)}</span>
  </div>
);

export function OptionsPage() {
  const [template, setTemplate] = useState<StrategyTemplate>('bull_call_spread');
  const [spot, setSpot] = useState('100');
  const [vol, setVol] = useState('30');
  const [rate, setRate] = useState('5');
  const [days, setDays] = useState('30');
  const [width, setWidth] = useState('10');
  const [contracts, setContracts] = useState('1');

  const params = {
    template,
    spot: Number(spot),
    volatility: Number(vol) / 100,
    rate: Number(rate) / 100,
    timeToExpiry: Number(days) / 365,
    width: Number(width),
    contracts: Number(contracts),
  };
  const valid =
    params.spot > 0 && params.volatility > 0 && params.timeToExpiry > 0 && params.width > 0 && params.contracts > 0;

  const analysisQ = useQuery({
    queryKey: ['options-strategy', params],
    queryFn: () => api.analyzeStrategy(params),
    enabled: valid,
  });

  const a = analysisQ.data;
  const ng = a?.netGreeks;

  return (
    <div className="page ui-page">
      <PageHeader title="Options" subtitle="Strategy builder · payoff · greeks" />
      <div className="split">
        <Card title="Strategy" icon={<Sigma size={13} />}>
          <div className="col">
            <Field label="Strategy">
              <select value={template} onChange={(e) => setTemplate(e.target.value as StrategyTemplate)}>
                {TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="ui-field-row">
              <Field label="Spot">
                <input value={spot} onChange={(e) => setSpot(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Vol %">
                <input value={vol} onChange={(e) => setVol(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <div className="ui-field-row">
              <Field label="Rate %">
                <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Days">
                <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <div className="ui-field-row">
              <Field label="Width">
                <input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Contracts">
                <input value={contracts} onChange={(e) => setContracts(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
          </div>
        </Card>

        <div className="col" style={{ minWidth: 0 }}>
          {!valid ? (
            <Card>
              <EmptyState
                icon={<Sigma size={20} />}
                title="Enter strategy parameters"
                hint="Positive spot, vol, days, width and contracts."
              />
            </Card>
          ) : analysisQ.isError ? (
            <Card>
              <EmptyState icon={<Sigma size={20} />} title="Failed to analyze strategy" />
            </Card>
          ) : a ? (
            <>
              <Card>
                <div className="opt-stats">
                  <Stat label={a.netDebit >= 0 ? 'Net debit' : 'Net credit'} value={fmt(Math.abs(a.netDebit))} />
                  <Stat
                    label="Max profit"
                    value={<span className="up">{a.unlimitedProfit ? 'Unlimited' : fmt(a.maxProfit ?? 0)}</span>}
                  />
                  <Stat
                    label="Max loss"
                    value={<span className="down">{a.unlimitedLoss ? 'Unlimited' : fmt(a.maxLoss ?? 0)}</span>}
                  />
                  <Stat
                    label={`Breakeven${a.breakevens.length === 1 ? '' : 's'}`}
                    value={a.breakevens.length ? a.breakevens.map((b) => fmt(b)).join(', ') : '—'}
                  />
                </div>
              </Card>

              <Card title="Payoff at expiration">
                <PayoffChart analysis={a} spot={params.spot} />
              </Card>

              <div className="opt-bottom">
                <Card title="Legs" flush>
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Side</th>
                          <th>Type</th>
                          <th className="num">Strike</th>
                          <th className="num">Premium</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.legs.map((l, i) => (
                          <tr key={i}>
                            <td>
                              <span className={l.side === 'long' ? 'up' : 'down'}>
                                {l.side === 'long' ? '+' : '−'}
                                {l.quantity} {l.side}
                              </span>
                            </td>
                            <td>{l.type.toUpperCase()}</td>
                            <td className="num">{fmt(l.strike)}</td>
                            <td className="num">{fmt(l.premium)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {ng && (
                  <Card title="Net greeks">
                    {greekRow('Delta', ng.delta)}
                    {greekRow('Gamma', ng.gamma)}
                    {greekRow('Theta / day', ng.theta / 365)}
                    {greekRow('Vega / 1%', ng.vega / 100)}
                    {greekRow('Rho / 1%', ng.rho / 100)}
                  </Card>
                )}
              </div>
            </>
          ) : (
            <Card>
              <p className="muted small">Analyzing…</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
