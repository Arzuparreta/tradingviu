import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

/**
 * Canonical data-ink primitives. Every surface composes these so the terminal
 * reads as one product. Depth comes from tone steps, not a border on every box;
 * no subtitles, no marketing copy.
 */

/* ── TitleBar ──────────────────────────────────────────────────────────── */
export function TitleBar({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-titlebar">
      <h1>{title}</h1>
      {actions != null && <div className="ui-titlebar-actions">{actions}</div>}
    </div>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */
export function Panel({
  title,
  icon,
  action,
  bordered,
  flush,
  scroll,
  className,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  flush?: boolean;
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`ui-panel${bordered ? ' ui-panel--bordered' : ''}${className ? ` ${className}` : ''}`}
    >
      {title != null && (
        <div className="ui-panel-head">
          <div className="ui-panel-title">
            {icon}
            <span className="ellipsis">{title}</span>
          </div>
          {action}
        </div>
      )}
      <div className={`ui-panel-body${flush ? ' flush' : ''}${scroll ? ' scroll' : ''}`}>
        {children}
      </div>
    </section>
  );
}

/* ── DataList / DataRow ────────────────────────────────────────────────── */
export function DataList({ children }: { children: ReactNode }) {
  return <div className="ui-list">{children}</div>;
}

export type RowTone = 'up' | 'down' | 'neutral';

export function DataRow({
  title,
  sub,
  value,
  delta,
  tone,
  to,
  href,
  onClick,
}: {
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  delta?: ReactNode;
  tone?: RowTone;
  to?: string;
  href?: string;
  onClick?: () => void;
}) {
  const toneCls = tone && tone !== 'neutral' ? ` ${tone}` : '';
  const inner = (
    <>
      <div className="ui-row-main">
        <span className="ui-row-title">{title}</span>
        {sub != null && <span className="ui-row-sub">{sub}</span>}
      </div>
      {(value != null || delta != null) && (
        <div className="ui-row-end">
          {value != null && <span className={`ui-row-value${toneCls}`}>{value}</span>}
          {delta != null && <span className={`ui-row-delta${toneCls}`}>{delta}</span>}
        </div>
      )}
    </>
  );
  if (to) {
    return (
      <Link className="ui-row" to={to}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a className="ui-row" href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="ui-row" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="ui-row">{inner}</div>;
}

/* ── DataTable ─────────────────────────────────────────────────────────── */
export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`ui-table-wrap${className ? ` ${className}` : ''}`}>
      <table className="ui-table">{children}</table>
    </div>
  );
}

/* ── Stat ──────────────────────────────────────────────────────────────── */
export function Stat({
  label,
  value,
  delta,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-label">{label}</span>
      <span className="ui-stat-value">{value}</span>
      {delta != null && (
        <span className={`ui-stat-delta${tone && tone !== 'neutral' ? ` ${tone}` : ''}`}>
          {delta}
        </span>
      )}
    </div>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────────── */
export type BadgeTone = 'neutral' | 'up' | 'down' | 'warn' | 'accent';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`ui-badge${tone !== 'neutral' ? ` ${tone}` : ''}`}>{children}</span>;
}

/* ── EmptyState ────────────────────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      {icon}
      <div className="ui-empty-title">{title}</div>
      {hint != null && <div className="ui-empty-hint">{hint}</div>}
      {action}
    </div>
  );
}

/* ── Field ─────────────────────────────────────────────────────────────── */
export function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      {label != null && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error != null && <span className="ui-field-error">{error}</span>}
    </div>
  );
}

/* ── Toolbar ───────────────────────────────────────────────────────────── */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

/* ── Segmented ─────────────────────────────────────────────────────────── */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: ReactNode }[];
}) {
  return (
    <div className="ui-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Dock (collapsible workspace container) ────────────────────────────── */
export function Dock({
  title,
  icon,
  actions,
  open,
  onToggle,
  fill,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  open: boolean;
  onToggle: () => void;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`ui-dock${open ? ' open' : ' collapsed'}${fill && open ? ' fill' : ''}`}>
      <div className="ui-dock-head">
        <button type="button" className="ui-dock-toggle" onClick={onToggle} aria-expanded={open}>
          <ChevronDown size={14} className="ui-dock-chevron" />
          <span className="ui-dock-title">
            {icon}
            <span className="ellipsis">{title}</span>
          </span>
        </button>
        {actions != null && <span className="ui-dock-actions">{actions}</span>}
      </div>
      <div className="ui-dock-body">{children}</div>
    </section>
  );
}
