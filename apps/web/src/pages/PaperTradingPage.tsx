import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function PaperTradingPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [symbolId, setSymbolId] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState('1');
  const [lastPrice, setLastPrice] = useState('100');
  const [limitPrice, setLimitPrice] = useState('100');

  const accountsQ = useQuery({ queryKey: ['paper-accounts'], queryFn: () => api.paperAccounts() });
  const symbolsQ = useQuery({ queryKey: ['symbols', 'paper'], queryFn: () => api.allSymbols(200) });
  const detailQ = useQuery({
    queryKey: ['paper-account', selectedId],
    queryFn: () => api.paperAccount(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!selectedId && accountsQ.data?.accounts[0]) setSelectedId(accountsQ.data.accounts[0].id);
  }, [accountsQ.data, selectedId]);

  const create = useMutation({
    mutationFn: () => api.createPaperAccount({ name, balance: 100000, currency: 'USD', leverage: 1 }),
    onSuccess: (r) => {
      setName('');
      setSelectedId(r.id);
      queryClient.invalidateQueries({ queryKey: ['paper-accounts'] });
    },
  });

  const order = useMutation({
    mutationFn: () =>
      api.placePaperOrder(selectedId!, {
        symbolId,
        side,
        type,
        quantity: Number(quantity),
        lastPrice: Number(lastPrice),
        ...(type === 'limit' ? { limitPrice: Number(limitPrice) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper-account', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['paper-accounts'] });
    },
  });

  return (
    <div className="page">
      <h1>Paper Trading</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <aside className="col" style={{ width: 300 }}>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" />
            <button className="primary" disabled={!name || create.isPending} onClick={() => create.mutate()}>Create</button>
          </div>
          {accountsQ.data?.accounts.map((a) => (
            <button
              key={a.id}
              className={selectedId === a.id ? 'primary' : ''}
              style={{ textAlign: 'left' }}
              onClick={() => setSelectedId(a.id)}
            >
              {a.name} · {Number(a.balance).toFixed(2)} {a.currency}
            </button>
          ))}
        </aside>
        <main className="col" style={{ flex: 1 }}>
          {!selectedId && <p className="muted">Create or select a paper account.</p>}
          {detailQ.data && (
            <>
              <section className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{detailQ.data.account.name}</div>
                    <div className="muted small">Leverage {detailQ.data.account.leverage}x</div>
                  </div>
                  <span className="grow" />
                  <div className="mono">{Number(detailQ.data.account.balance).toFixed(2)} {detailQ.data.account.currency}</div>
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
                    <select value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}>
                      <option value="buy">buy</option>
                      <option value="sell">sell</option>
                    </select>
                  </div>
                  <div>
                    <label>Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value as 'market' | 'limit')}>
                      <option value="market">market</option>
                      <option value="limit">limit</option>
                    </select>
                  </div>
                  <div><label>Qty</label><input value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
                  <div><label>Last</label><input value={lastPrice} onChange={(e) => setLastPrice(e.target.value)} /></div>
                  {type === 'limit' && <div><label>Limit</label><input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} /></div>}
                  <button className="primary" disabled={!symbolId || order.isPending} onClick={() => order.mutate()}>Place</button>
                </div>
              </section>

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Orders</h2>
                <div className="col">
                  {detailQ.data.orders.map((o) => (
                    <div key={o.id} className="row small">
                      <span className="mono">{new Date(o.createdAt).toLocaleString()}</span>
                      <span className="mono">{o.symbol.exchange}:{o.symbol.ticker}</span>
                      <span>{o.side} {o.quantity}</span>
                      <span>{o.type}</span>
                      <span className={o.status === 'filled' ? 'up' : 'muted'}>{o.status}</span>
                      {o.fillPrice && <span className="mono">@ {o.fillPrice}</span>}
                      <span className="muted">fee {o.fee}</span>
                    </div>
                  ))}
                  {detailQ.data.orders.length === 0 && <p className="muted">No orders yet.</p>}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
