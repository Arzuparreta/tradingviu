import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { api } from '../api/client';
import { Badge, Card, EmptyState, Field, PageHeader } from '../ui';

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

  const accounts = accountsQ.data?.accounts ?? [];
  const detail = detailQ.data;

  return (
    <div className="page ui-page">
      <PageHeader title="Paper trading" subtitle="Simulated accounts and order fills" />
      <div className="split">
        <Card title="Accounts" icon={<Wallet size={13} />} flush>
          <div className="wl-create">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Account name…"
              onKeyDown={(e) => e.key === 'Enter' && name && create.mutate()}
            />
            <button
              className="primary sm"
              disabled={!name || create.isPending}
              onClick={() => create.mutate()}
              aria-label="Create account"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="wl-lists">
            {accountsQ.isLoading && <p className="muted small wl-pad">Loading…</p>}
            {!accountsQ.isLoading && accounts.length === 0 && (
              <p className="muted small wl-pad">No accounts yet.</p>
            )}
            {accounts.map((a) => (
              <button
                key={a.id}
                className={`wl-list-row${selectedId === a.id ? ' active' : ''}`}
                onClick={() => setSelectedId(a.id)}
              >
                <span className="grow ellipsis">{a.name}</span>
                <span className="mono muted small">
                  {Number(a.balance).toFixed(0)} {a.currency}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <div className="col" style={{ minWidth: 0 }}>
          {!selectedId || !detail ? (
            <Card>
              <EmptyState icon={<Wallet size={20} />} title="No account selected" hint="Create or pick a paper account." />
            </Card>
          ) : (
            <>
              <Card>
                <div className="row">
                  <div className="col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="ellipsis">{detail.account.name}</strong>
                    <span className="muted small">Leverage {detail.account.leverage}×</span>
                  </div>
                  <span className="grow" />
                  <div className="ui-stat end">
                    <span className="ui-stat-label">Balance</span>
                    <span className="ui-stat-value">
                      {Number(detail.account.balance).toFixed(2)} {detail.account.currency}
                    </span>
                  </div>
                </div>
              </Card>

              <Card title="Order ticket">
                <div className="col">
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
                  <div className="pt-ticket">
                    <Field label="Side">
                      <select value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}>
                        <option value="buy">buy</option>
                        <option value="sell">sell</option>
                      </select>
                    </Field>
                    <Field label="Type">
                      <select value={type} onChange={(e) => setType(e.target.value as 'market' | 'limit')}>
                        <option value="market">market</option>
                        <option value="limit">limit</option>
                      </select>
                    </Field>
                    <Field label="Qty">
                      <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
                    </Field>
                    <Field label="Last">
                      <input value={lastPrice} onChange={(e) => setLastPrice(e.target.value)} inputMode="decimal" />
                    </Field>
                    {type === 'limit' && (
                      <Field label="Limit">
                        <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} inputMode="decimal" />
                      </Field>
                    )}
                    <button className="primary" disabled={!symbolId || order.isPending} onClick={() => order.mutate()}>
                      Place
                    </button>
                  </div>
                </div>
              </Card>

              <Card title="Orders" flush>
                {detail.orders.length === 0 ? (
                  <EmptyState icon={<Wallet size={20} />} title="No orders yet" hint="Place your first paper order above." />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Symbol</th>
                          <th>Side</th>
                          <th className="num">Qty</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th className="num">Fill</th>
                          <th className="num">Fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.orders.map((o) => (
                          <tr key={o.id}>
                            <td className="muted">{new Date(o.createdAt).toLocaleString()}</td>
                            <td className="mono">
                              {o.symbol.exchange}:{o.symbol.ticker}
                            </td>
                            <td>
                              <span className={o.side === 'buy' ? 'up' : 'down'}>{o.side}</span>
                            </td>
                            <td className="num">{o.quantity}</td>
                            <td className="muted">{o.type}</td>
                            <td>
                              <Badge tone={o.status === 'filled' ? 'up' : 'neutral'}>{o.status}</Badge>
                            </td>
                            <td className="num">{o.fillPrice ?? '—'}</td>
                            <td className="num muted">{o.fee}</td>
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
