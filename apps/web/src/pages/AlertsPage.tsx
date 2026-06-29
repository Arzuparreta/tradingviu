import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Link2, Mail } from 'lucide-react';
import { api } from '../api/client';
import type { AlertCondition, AlertOperator, Symbol } from '../api/types';
import { Badge, Card, EmptyState, Field, PageHeader, Toolbar } from '../ui';

const operators: AlertOperator[] = ['above', 'below', 'crosses_above', 'crosses_below', 'equals'];

const formatCondition = (condition: AlertCondition): string => {
  if (condition.type === 'price') {
    return `price ${String(condition.operator)} ${String(condition.value)}`;
  }
  if (
    condition.type === 'drawing' &&
    'drawing' in condition &&
    condition.drawing &&
    typeof condition.drawing === 'object'
  ) {
    const drawing = condition.drawing as { readonly name?: unknown };
    return `${String(drawing.name ?? 'drawing')} ${String(condition.target ?? 'line')} ${String(condition.operator)}`;
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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [emailMe, setEmailMe] = useState(false);

  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: () => api.alerts() });
  const symbolsQ = useQuery({ queryKey: ['symbols', 'alerts'], queryFn: () => api.allSymbols(200) });

  const symbols = useMemo<Symbol[]>(() => symbolsQ.data?.results ?? [], [symbolsQ.data]);
  const alerts = alertsQ.data?.alerts ?? [];

  const create = useMutation({
    mutationFn: () =>
      api.createAlert({
        symbolId,
        name: name || `Price ${operator} ${value}`,
        condition: { type: 'price', operator, value: Number(value) },
        channels: ['in_app', ...(emailMe ? ['email'] : []), ...(webhookUrl.trim() ? ['webhook'] : [])],
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
        active: true,
      }),
    onSuccess: () => {
      setName('');
      setWebhookUrl('');
      setEmailMe(false);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.updateAlert(input.id, { active: input.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const evaluate = useMutation({
    mutationFn: (id: string) => api.evaluateAlert(id, manualPrice ? { price: Number(manualPrice) } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <div className="page ui-page">
      <PageHeader title="Alerts" subtitle="Price conditions that notify you" />
      <div className="al-grid">
        <Card title="New alert" icon={<Bell size={13} />}>
          <div className="col">
            <Field label="Symbol">
              <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                <option value="">Select symbol…</option>
                {symbols.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.exchange}:{s.ticker}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakout alert" />
            </Field>
            <div className="ui-field-row">
              <Field label="Operator">
                <select value={operator} onChange={(e) => setOperator(e.target.value as AlertOperator)}>
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Value">
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <Field label="Webhook URL (optional)" error={null}>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/hook"
                inputMode="url"
              />
            </Field>
            <label className="ui-check">
              <input type="checkbox" checked={emailMe} onChange={(e) => setEmailMe(e.target.checked)} />
              Email me when it fires
            </label>
            <button
              className="primary"
              disabled={!symbolId || Number(value) <= 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              Create alert
            </button>
          </div>
        </Card>

        <div className="col" style={{ minWidth: 0 }}>
          <Toolbar>
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Manual price for evaluate"
              inputMode="decimal"
              style={{ maxWidth: 220 }}
            />
            <span className="muted small">Leave empty to use provider history.</span>
          </Toolbar>
          <Card title="Your alerts" flush>
            {alertsQ.isLoading ? (
              <p className="muted small" style={{ padding: 10 }}>
                Loading…
              </p>
            ) : alerts.length === 0 ? (
              <EmptyState icon={<Bell size={20} />} title="No alerts yet" hint="Create your first alert on the left." />
            ) : (
              <div className="tbl-wrap" style={{ border: 0 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Name</th>
                      <th>Symbol</th>
                      <th>Condition</th>
                      <th>Channels</th>
                      <th className="num">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>
                          <Badge tone={alert.active ? 'up' : 'neutral'}>{alert.active ? 'active' : 'paused'}</Badge>
                        </td>
                        <td>
                          <div>{alert.name}</div>
                          {alert.lastFiredAt && (
                            <div className="small up">fired {new Date(alert.lastFiredAt).toLocaleString()}</div>
                          )}
                        </td>
                        <td className="mono">
                          {alert.symbol.exchange}:{alert.symbol.ticker}
                        </td>
                        <td className="muted">{formatCondition(alert.condition)}</td>
                        <td>
                          <span className="al-channels">
                            {alert.channels.includes('email') && <Mail size={13} aria-label="email" />}
                            {alert.webhookUrl && <Link2 size={13} aria-label="webhook" />}
                          </span>
                        </td>
                        <td className="num">
                          <div className="al-actions">
                            <button className="sm" onClick={() => toggle.mutate({ id: alert.id, active: !alert.active })}>
                              {alert.active ? 'Pause' : 'Resume'}
                            </button>
                            <button className="sm" onClick={() => evaluate.mutate(alert.id)} disabled={evaluate.isPending}>
                              Evaluate
                            </button>
                            <button className="sm danger" onClick={() => remove.mutate(alert.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
