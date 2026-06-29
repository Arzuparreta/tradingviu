import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  Braces,
  CandlestickChart,
  Compass,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  PieChart,
  Plug,
  Sigma,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../stores/auth';
import { SymbolSearch } from './SymbolSearch';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Grouped so the rail reads as one product: home + chart, monitoring, signals,
// trading, research. Order = how often the owner reaches for each surface.
const NAV_GROUPS: readonly (readonly NavItem[])[] = [
  [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/chart', label: 'Chart', icon: CandlestickChart },
  ],
  [
    { to: '/watchlists', label: 'Watchlists', icon: Star },
    { to: '/discovery', label: 'Discovery', icon: Compass },
    { to: '/layout', label: 'Layouts', icon: LayoutGrid },
  ],
  [{ to: '/alerts', label: 'Alerts', icon: Bell }],
  [
    { to: '/portfolios', label: 'Portfolios', icon: PieChart },
    { to: '/paper', label: 'Paper trading', icon: Wallet },
    { to: '/brokers', label: 'Brokers', icon: Plug },
    { to: '/options', label: 'Options', icon: Sigma },
  ],
  [
    { to: '/pine', label: 'Pine', icon: Braces },
    { to: '/backtests', label: 'Backtests', icon: FlaskConical },
  ],
];

function Rail() {
  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-logo" title="tradingviu" aria-label="tradingviu home">
        t
      </Link>
      {NAV_GROUPS.map((group, gi) => (
        // display:contents keeps separators + items as flat flex children of .rail
        <div key={gi} style={{ display: 'contents' }}>
          {gi > 0 && <span className="rail-sep" />}
          {group.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
              data-label={label}
              aria-label={label}
            >
              <Icon size={18} strokeWidth={1.75} />
            </NavLink>
          ))}
        </div>
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
  return (
    <div className="app-shell">
      <Rail />
      <div className="app-main">
        <header className="ctxbar">
          <div className="ctxbar-search">
            <SymbolSearch />
          </div>
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
    </div>
  );
}
