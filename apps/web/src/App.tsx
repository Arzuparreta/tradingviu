import { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChartPage } from './pages/ChartPage';
import { AdminPage } from './pages/AdminPage';
import { WatchlistsPage } from './pages/WatchlistsPage';

function TopBar() {
  const { user, tenant } = useAuth();
  const loc = useLocation();
  return (
    <header className="topbar">
      <div className="row" style={{ gap: 16 }}>
        <Link to="/" className="logo">tradingviu</Link>
        {user && (
          <nav>
            <Link to="/" className={loc.pathname === '/' ? 'active' : ''}>Dashboard</Link>
            <Link to="/chart" className={loc.pathname.startsWith('/chart') ? 'active' : ''}>Chart</Link>
            <Link to="/watchlists" className={loc.pathname === '/watchlists' ? 'active' : ''}>Watchlists</Link>
            {user.globalRole === 'super_admin' && (
              <Link to="/admin" className={loc.pathname === '/admin' ? 'active' : ''}>Admin</Link>
            )}
          </nav>
        )}
      </div>
      <div className="row" style={{ gap: 12 }}>
        {tenant && <span className="muted small mono">{tenant.slug}</span>}
        {user && <span className="muted small">{user.email}</span>}
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center" style={{ height: '100vh' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <div className="app-shell">
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/chart" element={<RequireAuth><ChartPage /></RequireAuth>} />
        <Route path="/chart/:symbol" element={<RequireAuth><ChartPage /></RequireAuth>} />
        <Route path="/watchlists" element={<RequireAuth><WatchlistsPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
