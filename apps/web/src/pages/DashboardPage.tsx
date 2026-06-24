import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';
import { api } from '../api/client';

export function DashboardPage() {
  const { user, tenant, logout } = useAuth();
  const plansQ = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });
  const quotasQ = useQuery({ queryKey: ['quotas'], queryFn: () => api.quotas() });

  return (
    <div className="page">
      <h1>Welcome{user?.displayName ? `, ${user.displayName}` : ''}</h1>
      <div className="row" style={{ marginBottom: 24 }}>
        <Link to="/chart" className="primary" style={{ background: 'var(--accent)', padding: '8px 14px', borderRadius: 6, color: 'white' }}>
          Open chart →
        </Link>
        {user?.globalRole === 'super_admin' && (
          <Link to="/admin" style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 6 }}>
            Admin
          </Link>
        )}
        <span className="grow" />
        <button onClick={logout} className="ghost">Sign out</button>
      </div>

      <div className="col" style={{ gap: 24 }}>
        <section className="card">
          <h2 style={{ margin: '0 0 12px' }}>Your plan</h2>
          {quotasQ.data && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
              <div>
                <div className="muted small">Plan</div>
                <div style={{ fontSize: 18, fontWeight: 600, textTransform: 'uppercase' }}>{tenant?.planCode}</div>
              </div>
              <div>
                <div className="muted small">Workspace</div>
                <div>{tenant?.name}</div>
              </div>
              <div>
                <div className="muted small">Charts per tab</div>
                <div className="mono">{String(quotasQ.data.quotas.chartsPerTab)}</div>
              </div>
              <div>
                <div className="muted small">Indicators per chart</div>
                <div className="mono">{String(quotasQ.data.quotas.indicatorsPerChart)}</div>
              </div>
              <div>
                <div className="muted small">Price alerts</div>
                <div className="mono">{String(quotasQ.data.quotas.priceAlerts)}</div>
              </div>
              <div>
                <div className="muted small">Historical bars</div>
                <div className="mono">{String(quotasQ.data.quotas.historicalBars)}</div>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ margin: '0 0 12px' }}>Available plans</h2>
          {plansQ.isLoading && <p>Loading…</p>}
          {plansQ.data && (
            <div className="row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
              {plansQ.data.plans.map((p) => (
                <div key={p.code} className="card" style={{ minWidth: 220, borderColor: p.code === tenant?.planCode ? 'var(--accent)' : 'var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                  <div className="muted small" style={{ marginBottom: 8 }}>{p.description}</div>
                  <div className="mono" style={{ fontSize: 24 }}>
                    €{(p.priceMonthlyCents / 100).toFixed(2)}<span className="muted small" style={{ marginLeft: 6 }}>/mo</span>
                  </div>
                  <ul style={{ paddingLeft: 16, margin: '12px 0', fontSize: 12, color: 'var(--text-dim)' }}>
                    {p.features.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
                  </ul>
                  {p.code === tenant?.planCode ? (
                    <button disabled>Current</button>
                  ) : p.priceMonthlyCents > 0 ? (
                    <button className="primary" onClick={async () => {
                      try {
                        const r = await api.checkout(p.code);
                        if (r.url) window.location.href = r.url;
                      } catch (e) {
                        alert('Checkout not configured. Add STRIPE_SECRET_KEY to .env');
                      }
                    }}>Upgrade</button>
                  ) : (
                    <button disabled>Default</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
