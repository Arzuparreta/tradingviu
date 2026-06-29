import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { api } from '../api/client';
import type { BrokerId } from '../api/types';
import { Card, EmptyState, Field, PageHeader } from '../ui';

const brokerLabels: Record<BrokerId, string> = {
  alpaca: 'Alpaca',
  binance: 'Binance',
  ibkr: 'IBKR',
};

export function BrokersPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerId>('alpaca');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [ibkrBaseUrl, setIbkrBaseUrl] = useState('https://localhost:5000/v1/api');
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('AAPL');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('100');

  const connectionsQ = useQuery({ queryKey: ['broker-connections'], queryFn: () => api.brokerConnections() });
  const selected = useMemo(
    () => connectionsQ.data?.connections.find((connection) => connection.id === selectedId) ?? null,
    [connectionsQ.data, selectedId],
  );
  const accountsQ = useQuery({
    queryKey: ['broker-accounts', selectedId],
    queryFn: () => api.brokerAccounts(selectedId!),
    enabled: !!selectedId,
  });
  const positionsQ = useQuery({
    queryKey: ['broker-positions', selectedId, accountId],
    queryFn: () => api.brokerPositions(selectedId!, accountId || undefined),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!selectedId && connectionsQ.data?.connections[0]) setSelectedId(connectionsQ.data.connections[0].id);
  }, [connectionsQ.data, selectedId]);

  const create = useMutation({
    mutationFn: () => {
      const common = {
        ...(label ? { label } : {}),
        ...(accountId ? { accountId } : {}),
      };
      if (broker === 'ibkr') {
        return api.createBrokerConnection({
          broker,
          ...common,
          credentials: { baseUrl: ibkrBaseUrl, ...(accountId ? { accountId } : {}) },
        });
      }
      if (broker === 'binance') {
        return api.createBrokerConnection({
          broker,
          ...common,
          environment: 'paper',
          credentials: { apiKey, secretKey, testnet: true },
        });
      }
      return api.createBrokerConnection({
        broker,
        ...common,
        environment: 'paper',
        credentials: { apiKey, secretKey, paper: true },
      });
    },
    onSuccess: (result) => {
      setSelectedId(result.id);
      setLabel('');
      setApiKey('');
      setSecretKey('');
      queryClient.invalidateQueries({ queryKey: ['broker-connections'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteBrokerConnection(id),
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['broker-connections'] });
    },
  });

  const test = useMutation({
    mutationFn: (id: string) => api.testBrokerConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-connections'] });
      queryClient.invalidateQueries({ queryKey: ['broker-accounts', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['broker-positions', selectedId, accountId] });
    },
  });

  const order = useMutation({
    mutationFn: () =>
      api.placeBrokerOrder(selectedId!, {
        symbol,
        side,
        type,
        quantity: Number(quantity),
        timeInForce: 'day',
        ...(type === 'limit' ? { limitPrice: Number(limitPrice) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-positions', selectedId, accountId] });
    },
  });

  const canCreate = broker === 'ibkr' ? ibkrBaseUrl.length > 0 : apiKey.length > 0 && secretKey.length > 0;
  const connections = connectionsQ.data?.connections ?? [];
  const accounts = accountsQ.data?.accounts ?? [];
  const positions = positionsQ.data?.positions ?? [];

  return (
    <div className="page ui-page">
      <PageHeader title="Brokers" subtitle="Connect and trade through your broker accounts" />
      <div className="split">
        <div className="col">
          <Card title="New connection" icon={<Plug size={13} />}>
            <div className="col">
              <div className="ui-field-row">
                <Field label="Broker">
                  <select value={broker} onChange={(e) => setBroker(e.target.value as BrokerId)}>
                    <option value="alpaca">Alpaca paper</option>
                    <option value="binance">Binance testnet</option>
                    <option value="ibkr">IBKR gateway</option>
                  </select>
                </Field>
                <Field label="Label">
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={brokerLabels[broker]} />
                </Field>
              </div>
              {broker === 'ibkr' ? (
                <>
                  <Field label="Gateway URL">
                    <input value={ibkrBaseUrl} onChange={(e) => setIbkrBaseUrl(e.target.value)} />
                  </Field>
                  <Field label="Account ID">
                    <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="U1234567" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="API key">
                    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="Secret key">
                    <input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                </>
              )}
              <button className="primary" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
                Connect
              </button>
            </div>
          </Card>

          <Card title="Connections" flush>
            <div className="wl-lists">
              {connections.length === 0 && <p className="muted small wl-pad">No connections yet.</p>}
              {connections.map((c) => (
                <button
                  key={c.id}
                  className={`wl-list-row${selectedId === c.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="col grow" style={{ gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
                    <span className="ellipsis" style={{ maxWidth: '100%' }}>
                      {c.label ?? brokerLabels[c.broker]}
                    </span>
                    <span className="muted small mono ellipsis" style={{ maxWidth: '100%' }}>
                      {c.broker} · {c.status}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col" style={{ minWidth: 0 }}>
          {!selected ? (
            <Card>
              <EmptyState icon={<Plug size={20} />} title="No connection selected" hint="Create or pick a broker connection." />
            </Card>
          ) : (
            <>
              <Card>
                <div className="row">
                  <div className="col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="ellipsis">{selected.label ?? brokerLabels[selected.broker]}</strong>
                    <span className="muted small mono">
                      {selected.broker} · {selected.accountId ?? 'no account pinned'} · {selected.status}
                    </span>
                  </div>
                  <span className="grow" />
                  <button className="sm" disabled={test.isPending} onClick={() => test.mutate(selected.id)}>
                    Test
                  </button>
                  <button className="sm danger" disabled={remove.isPending} onClick={() => remove.mutate(selected.id)}>
                    Delete
                  </button>
                </div>
                {test.data && (
                  <p className={test.data.health.ok ? 'up small' : 'down small'} style={{ marginTop: 8 }}>
                    {test.data.health.ok ? 'Connected' : (test.data.health.message ?? 'Connection failed')} ·{' '}
                    {test.data.health.latencyMs}ms
                  </p>
                )}
              </Card>

              <Card title="Accounts" flush>
                {accounts.length === 0 ? (
                  <EmptyState icon={<Plug size={20} />} title="No accounts returned" hint="Test the connection to load accounts." />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Name</th>
                          <th className="num">Cash</th>
                          <th className="num">Equity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((account) => (
                          <tr key={account.id}>
                            <td className="mono">{account.id}</td>
                            <td>{account.name}</td>
                            <td className="num">
                              {account.cash.toFixed(2)} {account.currency}
                            </td>
                            <td className="num">{account.equity.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Order ticket">
                <div className="pt-ticket">
                  <Field label="Symbol">
                    <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
                  </Field>
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
                  {type === 'limit' && (
                    <Field label="Limit">
                      <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} inputMode="decimal" />
                    </Field>
                  )}
                  <button
                    className="primary"
                    disabled={!symbol || !selectedId || order.isPending}
                    onClick={() => order.mutate()}
                  >
                    Place
                  </button>
                </div>
                {order.data && (
                  <p className="small up" style={{ marginTop: 8 }}>
                    Order {order.data.order.id} is {order.data.order.status}
                  </p>
                )}
                {order.error instanceof Error && (
                  <p className="small down" style={{ marginTop: 8 }}>
                    {order.error.message}
                  </p>
                )}
              </Card>

              <Card title="Positions" flush>
                {positions.length === 0 ? (
                  <EmptyState icon={<Plug size={20} />} title="No open positions" />
                ) : (
                  <div className="tbl-wrap" style={{ border: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num">Qty</th>
                          <th className="num">Avg</th>
                          <th className="num">Value</th>
                          <th className="num">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((position) => (
                          <tr key={`${position.accountId ?? selected.id}:${position.symbol}`}>
                            <td className="mono">{position.symbol}</td>
                            <td className="num">{position.quantity}</td>
                            <td className="num">
                              {position.averagePrice !== undefined ? position.averagePrice.toFixed(2) : '—'}
                            </td>
                            <td className="num">
                              {position.marketValue !== undefined ? position.marketValue.toFixed(2) : '—'}
                            </td>
                            <td className={`num ${position.unrealizedPnl !== undefined && position.unrealizedPnl >= 0 ? 'up' : 'down'}`}>
                              {position.unrealizedPnl !== undefined ? position.unrealizedPnl.toFixed(2) : '—'}
                            </td>
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
