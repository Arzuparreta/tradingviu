import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Symbol } from '../api/types';

const useDebounced = <T,>(value: T, ms: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
};

interface SymbolSearchProps {
  /** When provided, selecting a result calls this instead of navigating to the chart. */
  onSelect?: (s: Symbol) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SymbolSearch({ onSelect, placeholder, autoFocus }: SymbolSearchProps = {}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debouncedQ = useDebounced(q.trim(), 150);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const results = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.search(debouncedQ, { limit: 12 }),
    enabled: debouncedQ.length > 0,
    staleTime: 30_000,
  });

  // Cmd/Ctrl+K focuses the global search box (not the per-panel pickers).
  useEffect(() => {
    if (onSelect) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  // Click outside closes the dropdown.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const items: Symbol[] = results.data?.results ?? [];

  useEffect(() => {
    setActive(0);
  }, [debouncedQ]);

  const select = (s: Symbol) => {
    setOpen(false);
    setQ('');
    if (onSelect) onSelect(s);
    else navigate(`/chart/${s.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      select(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="symbol-search" ref={boxRef}>
      <input
        ref={inputRef}
        value={q}
        placeholder={placeholder ?? 'Search symbols…  ⌘K'}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
      {open && debouncedQ.length > 0 && (
        <div className="symbol-search-results">
          {results.isLoading && <div className="symbol-search-empty muted small">Searching…</div>}
          {!results.isLoading && items.length === 0 && (
            <div className="symbol-search-empty muted small">No matches for “{debouncedQ}”</div>
          )}
          {items.map((s, i) => (
            <button
              key={s.id}
              className={`symbol-search-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(s)}
            >
              <span className="mono">{s.exchange}:{s.ticker}</span>
              <span className="muted small">{s.name}</span>
              <span className="grow" />
              <span className="muted small mono">{s.assetClass}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
