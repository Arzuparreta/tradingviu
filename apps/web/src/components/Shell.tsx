import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Compass, LayoutGrid, LogOut, Search, type LucideIcon } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { api } from '../api/client';
import { CommandPalette } from './CommandPalette';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// One terminal, three surfaces. Order = how often the owner reaches for each.
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Workspace', icon: LayoutGrid, end: true },
  { to: '/discovery', label: 'Discovery', icon: Compass },
  { to: '/alerts', label: 'Alerts', icon: Bell },
];

function Rail({ alertCount }: { alertCount: number }) {
  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-logo" title="tradingviu" aria-label="tradingviu home">
        t
      </Link>
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? false}
          className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
          data-label={label}
          aria-label={label}
        >
          <Icon size={18} strokeWidth={1.75} />
          {to === '/alerts' && alertCount > 0 && <span className="rail-badge">{alertCount}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="ctxbar-clock" title="Local time">
      {now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })}
    </span>
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: () => api.alerts(), enabled: !!user });
  const activeAlerts = (alertsQ.data?.alerts ?? []).filter((a) => a.active).length;

  // ⌘K opens the global command palette; the workspace top bar dispatches the
  // same intent through a custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    const onOpen = () => setCmdkOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('tv:open-cmdk', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tv:open-cmdk', onOpen);
    };
  }, []);

  return (
    <div className="app-shell">
      <Rail alertCount={activeAlerts} />
      <div className="app-main">
        <header className="ctxbar">
          <button type="button" className="cmdk-trigger" onClick={() => setCmdkOpen(true)}>
            <Search size={14} />
            <span>Search symbols or jump to…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="ctxbar-right">
            <Clock />
            <div className="ctxbar-owner">
              <span className="owner-email">{user?.email}</span>
              <button
                type="button"
                className="ctxbar-icon-btn"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>
        <div className="app-content">
          <Suspense fallback={<div className="center" style={{ height: '100%' }} />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </div>
  );
}
