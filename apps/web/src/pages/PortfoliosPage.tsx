import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

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

  return (
    <div className="page">
      <h1>Portfolios</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <aside className="col" style={{ width: 280 }}>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Portfolio name" />
            <button className="primary" disabled={!name || create.isPending} onClick={() => create.mutate()}>Create</button>
          </div>
          {portfoliosQ.data?.portfolios.map((p) => (
            <button
              key={p.id}
              className={selectedId === p.id ? 'primary' : ''}
              style={{ textAlign: 'left' }}
              onClick={() => setSelectedId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </aside>

        <main className="col" style={{ flex: 1 }}>
          {!selectedId && <p className="muted">Create or select a portfolio.</p>}
          {detailQ.data && (
            <>
              <section className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{detailQ.data.portfolio.name}</div>
                    <div className="muted small">{detailQ.data.portfolio.baseCurrency}</div>
                  </div>
                  <span className="grow" />
                  <div className="mono">Invested {detailQ.data.metrics.invested.toFixed(2)}</div>
                  <div className={detailQ.data.metrics.realizedPnl >= 0 ? 'up mono' : 'down mono'}>
                    P&L {detailQ.data.metrics.realizedPnl.toFixed(2)}
                  </div>
                  <button onClick={() => remove.mutate(detailQ.data.portfolio.id)}>Delete</button>
                </div>
              </section>

              <section className="card">
                <div className="row" style={{ alignItems: 'end' }}>
                  <div style={{ flex: 1 }}>
                    <label>Symbol</label>
                    <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                      <option value="">Select symbol</option>
                      {symbolsQ.data?.results.map((s) => <option key={s.id} value={s.id}>{s.exchange}:{s.ticker}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Side</label>
                    <select value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell' | 'dividend')}>
                      <option value="buy">buy</option>
                      <option value="sell">sell</option>
                      <option value="dividend">dividend</option>
                    </select>
                  </div>
                  <div><label>Qty</label><input value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
                  <div><label>Price</label><input value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                  <div><label>Fee</label><input value={fee} onChange={(e) => setFee(e.target.value)} /></div>
                  <button className="primary" disabled={!symbolId || addTx.isPending} onClick={() => addTx.mutate()}>Add</button>
                </div>
              </section>

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Holdings</h2>
                <div className="col">
                  {detailQ.data.holdings.map((h) => (
                    <div key={h.id} className="row">
                      <span className="mono">{h.symbol.exchange}:{h.symbol.ticker}</span>
                      <span className="grow muted small">{h.symbol.name}</span>
                      <span className="mono">{h.quantity}</span>
                      <span className="mono">@ {h.avgCost}</span>
                    </div>
                  ))}
                  {detailQ.data.holdings.length === 0 && <p className="muted">No open holdings.</p>}
                </div>
              </section>

              {analyticsQ.data && analyticsQ.data.analytics.positionsCount > 0 &&
                (() => {
                  const a = analyticsQ.data.analytics;
                  const money = (v: number) =>
                    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v);
                  const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
                  return (
                    <section className="card">
                      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Analytics</h2>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 18, marginBottom: 12 }}>
                        <div className="col" style={{ gap: 0 }}>
                          <span className="muted small">Market value</span>
                          <span className="mono">{money(a.marketValue)}</span>
                        </div>
                        <div className="col" style={{ gap: 0 }}>
                          <span className="muted small">Unrealized P&L</span>
                          <span className={a.unrealizedPnl >= 0 ? 'up mono' : 'down mono'}>
                            {money(a.unrealizedPnl)} ({pct(a.unrealizedPnlPct)})
                          </span>
                        </div>
                        <div className="col" style={{ gap: 0 }}>
                          <span className="muted small">Effective holdings</span>
                          <span className="mono">
                            {a.concentration.effectiveHoldings.toFixed(1)} / {a.positionsCount}
                          </span>
                        </div>
                        <div className="col" style={{ gap: 0 }}>
                          <span className="muted small">Top / Top 3</span>
                          <span className="mono">
                            {(a.concentration.topWeight * 100).toFixed(0)}% /{' '}
                            {(a.concentration.top3Weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        {a.best && (
                          <div className="col" style={{ gap: 0 }}>
                            <span className="muted small">Best / Worst</span>
                            <span className="mono">
                              <span className="up">{a.best.ticker} {pct(a.best.unrealizedPnlPct)}</span>
                              {a.worst && a.worst.symbolId !== a.best.symbolId && (
                                <>
                                  {' · '}
                                  <span className="down">
                                    {a.worst.ticker} {pct(a.worst.unrealizedPnlPct)}
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="muted small" style={{ marginBottom: 6 }}>Allocation by asset class</div>
                      <div className="col" style={{ gap: 4, marginBottom: 12 }}>
                        {a.byAssetClass.map((s) => (
                          <div key={s.key} className="row small" style={{ gap: 8, alignItems: 'center' }}>
                            <span style={{ width: 70, textTransform: 'capitalize' }}>{s.key}</span>
                            <div style={{ flex: 1, background: 'var(--bg-3)', borderRadius: 3, height: 10 }}>
                              <div
                                style={{
                                  width: `${(s.weight * 100).toFixed(1)}%`,
                                  background: '#4c8bf5',
                                  height: '100%',
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                            <span className="mono" style={{ width: 48, textAlign: 'right' }}>
                              {(s.weight * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>

                      <table className="discovery-table" style={{ minWidth: 0, fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th style={{ textAlign: 'right' }}>Weight</th>
                            <th style={{ textAlign: 'right' }}>Value</th>
                            <th style={{ textAlign: 'right' }}>Return</th>
                            <th style={{ textAlign: 'right' }}>P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.positions.map((p) => (
                            <tr key={p.symbolId}>
                              <td className="mono">{p.ticker}</td>
                              <td className="mono" style={{ textAlign: 'right' }}>
                                {(p.weight * 100).toFixed(1)}%
                              </td>
                              <td className="mono" style={{ textAlign: 'right' }}>{money(p.marketValue)}</td>
                              <td
                                className={`mono ${p.unrealizedPnl >= 0 ? 'up' : 'down'}`}
                                style={{ textAlign: 'right' }}
                              >
                                {pct(p.unrealizedPnlPct)}
                              </td>
                              <td
                                className={`mono ${p.unrealizedPnl >= 0 ? 'up' : 'down'}`}
                                style={{ textAlign: 'right' }}
                              >
                                {money(p.unrealizedPnl)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  );
                })()}

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Transactions</h2>
                <div className="col">
                  {detailQ.data.transactions.map((tx) => (
                    <div key={tx.id} className="row small">
                      <span className="mono">{new Date(tx.occurredAt).toLocaleString()}</span>
                      <span>{tx.side}</span>
                      <span className="mono">{tx.quantity} @ {tx.price}</span>
                      <span className="muted">fee {tx.fee}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
