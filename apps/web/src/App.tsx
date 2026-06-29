import { lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

// Pages are code-split so the charting surfaces only load when visited.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ChartProPage = lazy(() => import('./pages/ChartProPage').then((m) => ({ default: m.ChartProPage })));
const WatchlistsPage = lazy(() => import('./pages/WatchlistsPage').then((m) => ({ default: m.WatchlistsPage })));
const LayoutPage = lazy(() => import('./pages/LayoutPage').then((m) => ({ default: m.LayoutPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })));

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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/chart" element={<ChartProPage />} />
        <Route path="/chart/:symbol" element={<ChartProPage />} />
        <Route path="/watchlists" element={<WatchlistsPage />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/layout" element={<LayoutPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        {/* Legacy aliases → canonical chart. */}
        <Route path="/chart-pro" element={<RedirectToChart />} />
        <Route path="/chart-pro/:symbol" element={<RedirectToChart />} />
        <Route path="/chart-legacy" element={<RedirectToChart />} />
        <Route path="/chart-legacy/:symbol" element={<RedirectToChart />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
