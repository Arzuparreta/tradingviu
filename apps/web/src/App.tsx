import { lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

// Pages are code-split so the charting surfaces only load when visited.
const WorkspacePage = lazy(() =>
  import('./pages/WorkspacePage').then((m) => ({ default: m.WorkspacePage })),
);
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const DiscoveryPage = lazy(() =>
  import('./pages/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="center" style={{ height: '100vh' }}>
        Loading…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Legacy chart routes collapse to the canonical /chart, preserving any symbol. */
function RedirectToChart() {
  const { symbol } = useParams<{ symbol?: string }>();
  return <Navigate to={symbol ? `/chart/${symbol}` : '/chart'} replace />;
}

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<WorkspacePage />} />
        <Route path="/chart" element={<WorkspacePage />} />
        <Route path="/chart/:symbol" element={<WorkspacePage />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        {/* Consolidated surfaces → workspace. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/watchlists" element={<Navigate to="/" replace />} />
        <Route path="/layout" element={<Navigate to="/" replace />} />
        {/* Legacy chart aliases. */}
        <Route path="/chart-pro" element={<RedirectToChart />} />
        <Route path="/chart-pro/:symbol" element={<RedirectToChart />} />
        <Route path="/chart-legacy" element={<RedirectToChart />} />
        <Route path="/chart-legacy/:symbol" element={<RedirectToChart />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
