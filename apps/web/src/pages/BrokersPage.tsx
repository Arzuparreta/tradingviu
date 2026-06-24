import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BrokerId } from '../api/types';

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

  const connectionsQ = useQuery({
    queryKey: ['broker-connections'],
    queryFn: () => api.brokerConnections(),
  });
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
    if (!selectedId && connectionsQ.data?.connections[0])
      setSelectedId(connectionsQ.data.connections[0].id);
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

  const canCreate =
    broker === 'ibkr' ? ibkrBaseUrl.length > 0 : apiKey.length > 0 && secretKey.length > 0;

  return (
    <div className="page">
      <h1>Brokers</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <aside className="col" style={{ width: 340 }}>
          <section className="card col">
            <div className="row">
              <div className="grow">
                <label>Broker</label>
                <select
                  value={broker}
                  onChange={(event) => setBroker(event.target.value as BrokerId)}
                >
                  <option value="alpaca">Alpaca paper</option>
                  <option value="binance">Binance testnet</option>
                  <option value="ibkr">IBKR gateway</option>
                </select>
              </div>
              <div className="grow">
                <label>Label</label>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={brokerLabels[broker]}
                />
              </div>
            </div>
            {broker === 'ibkr' ? (
              <>
                <div>
                  <label>Gateway URL</label>
                  <input
                    value={ibkrBaseUrl}
                    onChange={(event) => setIbkrBaseUrl(event.target.value)}
                  />
                </div>
                <div>
                  <label>Account ID</label>
                  <input
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    placeholder="U1234567"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>API key</label>
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label>Secret key</label>
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(event) => setSecretKey(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
            <button
              className="primary"
              disabled={!canCreate || create.isPending}
              onClick={() => create.mutate()}
            >
              Connect
            </button>
          </section>

          {connectionsQ.data?.connections.map((connection) => (
            <button
              key={connection.id}
              className={selectedId === connection.id ? 'primary' : ''}
              style={{ textAlign: 'left' }}
              onClick={() => setSelectedId(connection.id)}
            >
              <span>{connection.label ?? brokerLabels[connection.broker]}</span>
              <span className="muted small mono" style={{ display: 'block' }}>
                {connection.broker} · {connection.status}
              </span>
            </button>
          ))}
        </aside>

        <main className="col" style={{ flex: 1, minWidth: 0 }}>
          {!selected && <p className="muted">Create or select a broker connection.</p>}
          {selected && (
            <>
              <section className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {selected.label ?? brokerLabels[selected.broker]}
                    </div>
                    <div className="muted small mono">
                      {selected.broker} · {selected.accountId ?? 'no account pinned'} ·{' '}
                      {selected.status}
                    </div>
                  </div>
                  <span className="grow" />
                  <button disabled={test.isPending} onClick={() => test.mutate(selected.id)}>
                    Test
                  </button>
                  <button
                    className="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(selected.id)}
                  >
                    Delete
                  </button>
                </div>
                {test.data && (
                  <p className={test.data.health.ok ? 'up small' : 'down small'}>
                    {test.data.health.ok
                      ? 'Connected'
                      : (test.data.health.message ?? 'Connection failed')}{' '}
                    · {test.data.health.latencyMs}ms
                  </p>
                )}
              </section>

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Accounts</h2>
                <div className="col">
                  {accountsQ.data?.accounts.map((account) => (
                    <div key={account.id} className="row small">
                      <span className="mono">{account.id}</span>
                      <span>{account.name}</span>
                      <span className="grow" />
                      <span>
                        cash {account.cash.toFixed(2)} {account.currency}
                      </span>
                      <span>equity {account.equity.toFixed(2)}</span>
                    </div>
                  ))}
                  {accountsQ.data?.accounts.length === 0 && (
                    <p className="muted">No accounts returned.</p>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="row" style={{ alignItems: 'end' }}>
                  <div className="grow">
                    <label>Symbol</label>
                    <input
                      value={symbol}
                      onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <label>Side</label>
                    <select
                      value={side}
                      onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}
                    >
                      <option value="buy">buy</option>
                      <option value="sell">sell</option>
                    </select>
                  </div>
                  <div>
                    <label>Type</label>
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value as 'market' | 'limit')}
                    >
                      <option value="market">market</option>
                      <option value="limit">limit</option>
                    </select>
                  </div>
                  <div>
                    <label>Qty</label>
                    <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  </div>
                  {type === 'limit' && (
                    <div>
                      <label>Limit</label>
                      <input
                        value={limitPrice}
                        onChange={(event) => setLimitPrice(event.target.value)}
                      />
                    </div>
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
                  <p className="small up">
                    Order {order.data.order.id} is {order.data.order.status}
                  </p>
                )}
                {order.error instanceof Error && (
                  <p className="small down">{order.error.message}</p>
                )}
              </section>

              <section className="card">
                <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Positions</h2>
                <div className="col">
                  {positionsQ.data?.positions.map((position) => (
                    <div
                      key={`${position.accountId ?? selected.id}:${position.symbol}`}
                      className="row small"
                    >
                      <span className="mono">{position.symbol}</span>
                      <span>qty {position.quantity}</span>
                      {position.averagePrice !== undefined && (
                        <span>avg {position.averagePrice.toFixed(2)}</span>
                      )}
                      {position.marketValue !== undefined && (
                        <span>value {position.marketValue.toFixed(2)}</span>
                      )}
                      {position.unrealizedPnl !== undefined && (
                        <span className={position.unrealizedPnl >= 0 ? 'up' : 'down'}>
                          pnl {position.unrealizedPnl.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                  {positionsQ.data?.positions.length === 0 && (
                    <p className="muted">No open positions.</p>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
