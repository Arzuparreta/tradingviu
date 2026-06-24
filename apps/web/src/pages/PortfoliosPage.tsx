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
