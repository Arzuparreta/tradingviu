import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AlertOperator, PriceAlertCondition, Symbol } from '../api/types';

const operators: AlertOperator[] = ['above', 'below', 'crosses_above', 'crosses_below', 'equals'];

const formatCondition = (condition: PriceAlertCondition | Record<string, unknown>): string => {
  if (condition.type === 'price') {
    return `price ${String(condition.operator)} ${String(condition.value)}`;
  }
  return String(condition.type ?? 'condition');
};

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [symbolId, setSymbolId] = useState('');
  const [name, setName] = useState('');
  const [operator, setOperator] = useState<AlertOperator>('above');
  const [value, setValue] = useState('100');
  const [manualPrice, setManualPrice] = useState('');

  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: () => api.alerts() });
  const symbolsQ = useQuery({ queryKey: ['symbols', 'alerts'], queryFn: () => api.allSymbols(200) });

  const symbols = useMemo<Symbol[]>(() => symbolsQ.data?.results ?? [], [symbolsQ.data]);

  const create = useMutation({
    mutationFn: () =>
      api.createAlert({
        symbolId,
        name: name || `Price ${operator} ${value}`,
        condition: { type: 'price', operator, value: Number(value) },
        channels: ['in_app'],
        active: true,
      }),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => api.updateAlert(input.id, { active: input.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const evaluate = useMutation({
    mutationFn: (id: string) =>
      api.evaluateAlert(id, manualPrice ? { price: Number(manualPrice) } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <div className="page">
      <h1>Alerts</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <section className="card" style={{ width: 340 }}>
          <div className="col">
            <div>
              <label>Symbol</label>
              <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                <option value="">Select symbol</option>
                {symbols.map((s) => (
                  <option key={s.id} value={s.id}>{s.exchange}:{s.ticker}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakout alert" />
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Operator</label>
                <select value={operator} onChange={(e) => setOperator(e.target.value as AlertOperator)}>
                  {operators.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Value</label>
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
              </div>
            </div>
            <button className="primary" disabled={!symbolId || Number(value) <= 0 || create.isPending} onClick={() => create.mutate()}>
              Create alert
            </button>
          </div>
        </section>

        <section style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Manual price for evaluate"
              style={{ maxWidth: 220 }}
            />
            <span className="muted small">Leave empty to use provider history.</span>
          </div>
          {alertsQ.isLoading && <p className="muted">Loading...</p>}
          <div className="col">
            {alertsQ.data?.alerts.map((alert) => (
              <div key={alert.id} className="card">
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{alert.name}</div>
                    <div className="muted small mono">{alert.symbol.exchange}:{alert.symbol.ticker} · {formatCondition(alert.condition)}</div>
                    {alert.lastFiredAt && <div className="small up">Last fired {new Date(alert.lastFiredAt).toLocaleString()}</div>}
                  </div>
                  <span className="grow" />
                  <span className={alert.active ? 'up small' : 'muted small'}>{alert.active ? 'active' : 'paused'}</span>
                  <button onClick={() => toggle.mutate({ id: alert.id, active: !alert.active })}>
                    {alert.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => evaluate.mutate(alert.id)} disabled={evaluate.isPending}>Evaluate</button>
                  <button onClick={() => remove.mutate(alert.id)}>Delete</button>
                </div>
              </div>
            ))}
            {alertsQ.data?.alerts.length === 0 && <p className="muted">No alerts yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
