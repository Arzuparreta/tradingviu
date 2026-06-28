import { Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="page">
      <h1>Welcome{user?.displayName ? `, ${user.displayName}` : ''}</h1>
      <div className="row" style={{ marginBottom: 24 }}>
        <Link
          to="/chart"
          className="primary"
          style={{ background: 'var(--accent)', padding: '8px 14px', borderRadius: 6, color: 'white' }}
        >
          Open chart →
        </Link>
        <span className="grow" />
        <button onClick={logout} className="ghost">Sign out</button>
      </div>
    </div>
  );
}
