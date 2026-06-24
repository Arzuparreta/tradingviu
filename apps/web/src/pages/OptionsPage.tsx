import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { StrategyAnalysis, StrategyTemplate } from '../api/types';

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

const fmt = (n: number, dp = 2) => n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--panel, #111)', borderRadius: 8 }}>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#555" strokeWidth={1} />
      {spotX !== null && <line x1={spotX} y1={8} x2={spotX} y2={H - 8} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4" />}
      {beMarks.map((m, i) => (
        <g key={i}>
          <line x1={m.x} y1={8} x2={m.x} y2={H - 8} stroke="#eab308" strokeWidth={1} strokeDasharray="2 3" />
          <text x={m.x + 3} y={18} fill="#eab308" fontSize={10}>{fmt(m.v)}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#22c55e" strokeWidth={2} />
    </svg>
  );
}

const greekRow = (label: string, value: number, dp = 4) => (
  <div className="row small" style={{ justifyContent: 'space-between' }}>
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
  const valid = params.spot > 0 && params.volatility > 0 && params.timeToExpiry > 0 && params.width > 0 && params.contracts > 0;

  const analysisQ = useQuery({
    queryKey: ['options-strategy', params],
    queryFn: () => api.analyzeStrategy(params),
    enabled: valid,
  });

  const a = analysisQ.data;
  const ng = a?.netGreeks;

  return (
    <div className="page">
      <h1>Options</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <aside className="col" style={{ width: 240 }}>
          <section className="card col" style={{ gap: 8 }}>
            <div>
              <label>Strategy</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value as StrategyTemplate)}>
                {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="row">
              <div><label>Spot</label><input value={spot} onChange={(e) => setSpot(e.target.value)} /></div>
              <div><label>Vol %</label><input value={vol} onChange={(e) => setVol(e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label>Rate %</label><input value={rate} onChange={(e) => setRate(e.target.value)} /></div>
              <div><label>Days</label><input value={days} onChange={(e) => setDays(e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label>Width</label><input value={width} onChange={(e) => setWidth(e.target.value)} /></div>
              <div><label>Contracts</label><input value={contracts} onChange={(e) => setContracts(e.target.value)} /></div>
            </div>
          </section>
        </aside>

        <main className="col" style={{ flex: 1, gap: 16 }}>
          {!valid && <p className="muted">Enter positive spot, vol, days, width and contracts.</p>}
          {analysisQ.isError && <p className="down">Failed to analyze strategy.</p>}
          {a && (
            <>
              <section className="card">
                <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div className="muted small">{a.netDebit >= 0 ? 'Net Debit' : 'Net Credit'}</div>
                    <div className="mono" style={{ fontWeight: 600 }}>{fmt(Math.abs(a.netDebit))}</div>
                  </div>
                  <div>
                    <div className="muted small">Max Profit</div>
                    <div className="mono up">{a.unlimitedProfit ? 'Unlimited' : fmt(a.maxProfit ?? 0)}</div>
                  </div>
                  <div>
                    <div className="muted small">Max Loss</div>
                    <div className="mono down">{a.unlimitedLoss ? 'Unlimited' : fmt(a.maxLoss ?? 0)}</div>
                  </div>
                  <div>
                    <div className="muted small">Breakeven{a.breakevens.length === 1 ? '' : 's'}</div>
                    <div className="mono">{a.breakevens.length ? a.breakevens.map((b) => fmt(b)).join(', ') : '—'}</div>
                  </div>
                </div>
              </section>

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Payoff at expiration</h2>
                <PayoffChart analysis={a} spot={params.spot} />
              </section>

              <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <section className="card" style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Legs</h2>
                  <div className="col" style={{ gap: 6 }}>
                    {a.legs.map((l, i) => (
                      <div key={i} className="row small" style={{ gap: 10 }}>
                        <span className={l.side === 'long' ? 'up' : 'down'}>{l.side === 'long' ? '+' : '−'}{l.quantity}</span>
                        <span>{l.type.toUpperCase()}</span>
                        <span className="mono">@ {fmt(l.strike)}</span>
                        <span className="grow" />
                        <span className="muted">premium</span>
                        <span className="mono">{fmt(l.premium)}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {ng && (
                  <section className="card" style={{ width: 220 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Net Greeks</h2>
                    {greekRow('Delta', ng.delta)}
                    {greekRow('Gamma', ng.gamma)}
                    {greekRow('Theta / day', ng.theta / 365)}
                    {greekRow('Vega / 1%', ng.vega / 100)}
                    {greekRow('Rho / 1%', ng.rho / 100)}
                  </section>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
