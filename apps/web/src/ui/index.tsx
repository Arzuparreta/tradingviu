import type { ReactNode } from 'react';

/**
 * Shared data-ink primitives. Every surface composes these so the terminal
 * reads as one product: same cards, tables, stats, badges, empty states.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-titles">
        <h1>{title}</h1>
        {subtitle != null && <p className="muted">{subtitle}</p>}
      </div>
      {actions != null && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  icon,
  action,
  flush,
  className,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ui-card${className ? ` ${className}` : ''}`}>
      {title != null && (
        <div className="ui-card-head">
          <div className="ui-card-head-title">
            {icon}
            <span className="ellipsis">{title}</span>
          </div>
          {action}
        </div>
      )}
      <div className={`ui-card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

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

export type BadgeTone = 'neutral' | 'up' | 'down' | 'warn' | 'accent';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`ui-badge${tone !== 'neutral' ? ` ${tone}` : ''}`}>{children}</span>;
}

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

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

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
