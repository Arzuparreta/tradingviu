import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../stores/auth';
import { Navigate } from 'react-router-dom';

export function AdminPage() {
  const { user } = useAuth();
  const statsQ = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.adminStats() });

  if (user?.globalRole !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page">
      <h1>Admin</h1>
      {statsQ.isLoading && <p>Loading…</p>}
      {statsQ.data && (
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div className="card">
            <div className="muted small">Tenants</div>
            <div className="mono" style={{ fontSize: 28 }}>{statsQ.data.tenants}</div>
          </div>
          <div className="card">
            <div className="muted small">Users</div>
            <div className="mono" style={{ fontSize: 28 }}>{statsQ.data.users}</div>
          </div>
          <div className="card">
            <div className="muted small">Exchanges</div>
            <div className="mono" style={{ fontSize: 28 }}>{statsQ.data.exchanges}</div>
          </div>
          <div className="card">
            <div className="muted small">Symbols</div>
            <div className="mono" style={{ fontSize: 28 }}>{statsQ.data.symbols}</div>
          </div>
        </div>
      )}
      <p className="muted" style={{ marginTop: 32 }}>
        More admin views coming in slice 2 (tenant management, plan editor, symbol catalog import, provider health).
      </p>
    </div>
  );
}
