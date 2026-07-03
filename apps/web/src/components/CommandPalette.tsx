import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconBell, IconCompass, IconSearch, IconWorkspace, type IconProps } from '../ui/icons';
import { api } from '../api/client';
import type { Symbol } from '../api/types';

interface Action {
  id: string;
  label: string;
  icon: ComponentType<IconProps>;
  hint: string;
  run: () => void;
}

const useDebounced = <T,>(value: T, ms: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
};

/**
 * Global command palette (⌘K). Symbol search + quick navigation. Mounted once
 * in the Shell so every surface shares it; picking a symbol opens it on the
 * workspace, which loads it into the active chart panel.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const debouncedQ = useDebounced(q.trim(), 150);

  const actions = useMemo<Action[]>(
    () => [
      { id: 'workspace', label: 'Workspace', icon: IconWorkspace, hint: 'go', run: () => navigate('/') },
      { id: 'discovery', label: 'Discovery', icon: IconCompass, hint: 'go', run: () => navigate('/discovery') },
      { id: 'alerts', label: 'Alerts', icon: IconBell, hint: 'go', run: () => navigate('/alerts') },
    ],
    [navigate],
  );

  const results = useQuery({
    queryKey: ['cmdk-search', debouncedQ],
    queryFn: () => api.search(debouncedQ, { limit: 10 }),
    enabled: open && debouncedQ.length > 0,
    staleTime: 30_000,
  });

  const symbols: Symbol[] = open && debouncedQ.length > 0 ? results.data?.results ?? [] : [];
  const visibleActions = useMemo(() => {
    const needle = debouncedQ.toLowerCase();
    if (!needle) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(needle));
  }, [actions, debouncedQ]);

  // Flat selectable list: actions first, then symbol results.
  const flat = useMemo(
    () => [
      ...visibleActions.map((a) => ({ kind: 'action' as const, action: a })),
      ...symbols.map((s) => ({ kind: 'symbol' as const, symbol: s })),
    ],
    [visibleActions, symbols],
  );

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return;
  }, [open]);

  useEffect(() => setActive(0), [debouncedQ]);

  if (!open) return null;

  const run = (i: number) => {
    const item = flat[i];
    if (!item) return;
    onClose();
    if (item.kind === 'action') item.action.run();
    else navigate(`/chart/${item.symbol.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="ui-cmdk-backdrop" onMouseDown={onClose}>
      <div className="ui-cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="ui-cmdk-input"
          value={q}
          placeholder="Search symbols or jump to…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="ui-cmdk-list">
          {visibleActions.length > 0 && <div className="ui-cmdk-group">Go to</div>}
          {visibleActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                className={`ui-cmdk-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
              >
                <Icon size={15} />
                <span>{a.label}</span>
                <span className="ui-cmdk-meta">↵</span>
              </button>
            );
          })}

          {debouncedQ.length > 0 && <div className="ui-cmdk-group">Symbols</div>}
          {results.isLoading && debouncedQ.length > 0 && (
            <div className="ui-cmdk-group">Searching…</div>
          )}
          {symbols.map((s, idx) => {
            const i = visibleActions.length + idx;
            return (
              <button
                key={s.id}
                className={`ui-cmdk-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
              >
                <IconSearch size={15} />
                <span className="mono">
                  {s.exchange}:{s.ticker}
                </span>
                <span className="muted ellipsis">{s.name}</span>
                <span className="ui-cmdk-meta">{s.assetClass}</span>
              </button>
            );
          })}
          {!results.isLoading && debouncedQ.length > 0 && symbols.length === 0 && (
            <div className="ui-cmdk-group">No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}
