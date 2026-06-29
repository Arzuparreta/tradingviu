import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PieChart, Plus } from 'lucide-react';
import { api } from '../api/client';
import { Card, EmptyState, Field, PageHeader, Stat } from '../ui';

const money = (v: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v);
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

export function PortfoliosPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [symbolId, setSymbolId] = useState('');
  const [side, setSide] = useState<'buy' | 'sell' | 'dividend'>('buy');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('100');
  const [fee, setFee] = useState('0');

  const portfoliosQ = useQuery({ queryKey: ['portfolios'], queryFn: () => api.portfolios() });
  const symbolsQ = useQuery({ queryKey: ['symbols', 'portfolios'], queryFn: () => api.allSymbols(200) });
  const detailQ = useQuery({
    queryKey: ['portfolio', selectedId],
    queryFn: () => api.portfolio(selectedId!),
    enabled: !!selectedId,
  });
  const analyticsQ = useQuery({
    queryKey: ['portfolio-analytics', selectedId],
    queryFn: () => api.portfolioAnalytics(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!selectedId && portfoliosQ.data?.portfolios[0]) setSelectedId(portfoliosQ.data.portfolios[0].id);
  }, [portfoliosQ.data, selectedId]);

  const create = useMutation({
    mutationFn: () => api.createPortfolio({ name, baseCurrency: 'USD' }),
    onSuccess: (r) => {
      setName('');
      setSelectedId(r.id);
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deletePortfolio(id),
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  const addTx = useMutation({
    mutationFn: () =>
      api.addPortfolioTransaction(selectedId!, {
        symbolId,
        side,
        quantity: Number(quantity),
        price: Number(price),
        fee: Number(fee || 0),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio', selectedId] }),
  });

  const portfolios = portfoliosQ.data?.portfolios ?? [];
  const detail = detailQ.data;
  const analytics = analyticsQ.data?.analytics;

  return (
    <div className="page ui-page">
      <PageHeader title="Portfolios" subtitle="Holdings, transactions and analytics" />
      <div className="split">
        <Card title="Portfolios" icon={<PieChart size={13} />} flush>
          <div className="wl-create">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Portfolio name…"
              onKeyDown={(e) => e.key === 'Enter' && name && create.mutate()}
            />
            <button
              className="primary sm"
              disabled={!name || create.isPending}
              onClick={() => create.mutate()}
              aria-label="Create portfolio"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="wl-lists">
            {portfolios.length === 0 && <p className="muted small wl-pad">No portfolios yet.</p>}
            {portfolios.map((p) => (
              <button
                key={p.id}
                className={`wl-list-row${selectedId === p.id ? ' active' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="grow ellipsis">{p.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="col" style={{ minWidth: 0 }}>
          {!selectedId || !detail ? (
            <Card>
              <EmptyState icon={<PieChart size={20} />} title="No portfolio selected" hint="Create or pick a portfolio." />
            </Card>
          ) : (
            <>
              <Card>
                <div className="row">
                  <div className="col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="ellipsis">{detail.portfolio.name}</strong>
                    <span className="muted small">{detail.portfolio.baseCurrency}</span>
                  </div>
                  <span className="grow" />
                  <div className="ui-stat end">
                    <span className="ui-stat-label">Invested</span>
                    <span className="ui-stat-value">{detail.metrics.invested.toFixed(2)}</span>
                  </div>
                  <div className="ui-stat end">
                    <span className="ui-stat-label">Realized P&amp;L</span>
                    <span className={`ui-stat-value ${detail.metrics.realizedPnl >= 0 ? 'up' : 'down'}`}>
                      {detail.metrics.realizedPnl.toFixed(2)}
                    </span>
                  </div>
                  <button className="sm danger" onClick={() => remove.mutate(detail.portfolio.id)}>
                    Delete
                  </button>
                </div>
              </Card>

              <Card title="Add transaction">
                <div className="pt-ticket">
                  <Field label="Symbol">
                    <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                      <option value="">Select symbol…</option>
                      {symbolsQ.data?.results.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.exchange}:{s.ticker}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Side">
                    <select value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell' | 'dividend')}>
                      <option value="buy">buy</option>
                      <option value="sell">sell</option>
                      <option value="dividend">dividend</option>
                    </select>
                  </Field>
                  <Field label="Qty">
                    <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field label="Price">
                    <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field label="Fee">
                    <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" />
                  </Field>
                  <button className="primary" disabled={!symbolId || addTx.isPending} onClick={() => addTx.mutate()}>
                    Add
                  </button>
                </div>
              </Card>

              <Card title="Holdings" flush>
                {detail.holdings.length === 0 ? (
                  <EmptyState icon={<PieChart size={20} />} title="No open holdings" hint="Add a transaction to build positions." />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Name</th>
                          <th className="num">Qty</th>
                          <th className="num">Avg cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.holdings.map((h) => (
                          <tr key={h.id}>
                            <td className="mono">
                              {h.symbol.exchange}:{h.symbol.ticker}
                            </td>
                            <td className="muted ellipsis">{h.symbol.name}</td>
                            <td className="num">{h.quantity}</td>
                            <td className="num">{h.avgCost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {analytics && analytics.positionsCount > 0 && (
                <Card title="Analytics">
                  <div className="opt-stats" style={{ marginBottom: 12 }}>
                    <Stat label="Market value" value={money(analytics.marketValue)} />
                    <Stat
                      label="Unrealized P&L"
                      value={
                        <span className={analytics.unrealizedPnl >= 0 ? 'up' : 'down'}>
                          {money(analytics.unrealizedPnl)} ({pct(analytics.unrealizedPnlPct)})
                        </span>
                      }
                    />
                    <Stat
                      label="Effective holdings"
                      value={`${analytics.concentration.effectiveHoldings.toFixed(1)} / ${analytics.positionsCount}`}
                    />
                    <Stat
                      label="Top / Top 3"
                      value={`${(analytics.concentration.topWeight * 100).toFixed(0)}% / ${(analytics.concentration.top3Weight * 100).toFixed(0)}%`}
                    />
                  </div>

                  <div className="muted small" style={{ marginBottom: 6 }}>
                    Allocation by asset class
                  </div>
                  <div className="col" style={{ gap: 5, marginBottom: 14 }}>
                    {analytics.byAssetClass.map((s) => (
                      <div key={s.key} className="alloc-row">
                        <span className="alloc-key">{s.key}</span>
                        <div className="alloc-bar">
                          <div className="alloc-fill" style={{ width: `${(s.weight * 100).toFixed(1)}%` }} />
                        </div>
                        <span className="alloc-val">{(s.weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>

                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num">Weight</th>
                          <th className="num">Value</th>
                          <th className="num">Return</th>
                          <th className="num">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.positions.map((p) => (
                          <tr key={p.symbolId}>
                            <td className="mono">{p.ticker}</td>
                            <td className="num">{(p.weight * 100).toFixed(1)}%</td>
                            <td className="num">{money(p.marketValue)}</td>
                            <td className={`num ${p.unrealizedPnl >= 0 ? 'up' : 'down'}`}>{pct(p.unrealizedPnlPct)}</td>
                            <td className={`num ${p.unrealizedPnl >= 0 ? 'up' : 'down'}`}>{money(p.unrealizedPnl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <Card title="Transactions" flush>
                {detail.transactions.length === 0 ? (
                  <EmptyState icon={<PieChart size={20} />} title="No transactions yet" />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Side</th>
                          <th className="num">Qty</th>
                          <th className="num">Price</th>
                          <th className="num">Fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="muted">{new Date(tx.occurredAt).toLocaleString()}</td>
                            <td>{tx.side}</td>
                            <td className="num">{tx.quantity}</td>
                            <td className="num">{tx.price}</td>
                            <td className="num muted">{tx.fee}</td>
                          </tr>
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
