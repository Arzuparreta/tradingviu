import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconClose, IconPlus, IconStar, IconTrash } from '../../ui/icons';
import { api } from '../../api/client';
import type { Quote, WatchlistItem } from '../../api/types';
import { quoteKey, useMarketQuotes, type QuoteSymbol } from '../../hooks/use-market-quotes';
import { Dock } from '../../ui';

const pct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

function WatchRow({
  item,
  quote,
  onRemove,
}: {
  item: WatchlistItem;
  quote?: Quote | undefined;
  onRemove: () => void;
}) {
  const historyQ = useQuery({
    queryKey: ['dock-history', item.symbol.id],
    queryFn: () => api.history(item.symbol.id, '1d', 3),
    staleTime: 60_000,
  });
  const bars = historyQ.data?.bars ?? [];
  const prevClose = bars.length >= 2 ? bars[bars.length - 2]!.close : bars[0]?.close;
  const lastClose = bars[bars.length - 1]?.close;
  const mid = quote ? (quote.bid + quote.ask) / 2 : undefined;
  const price = mid ?? lastClose;
  const change = prevClose && price ? (price - prevClose) / prevClose : null;

  const [flash, setFlash] = useState<'up' | 'down' | ''>('');
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (mid == null) return;
    const before = prev.current;
    prev.current = mid;
    if (before != null && mid !== before) {
      setFlash(mid > before ? 'up' : 'down');
      const t = setTimeout(() => setFlash(''), 450);
      return () => clearTimeout(t);
    }
    return;
  }, [mid]);

  const tone = change == null ? '' : change >= 0 ? 'up' : 'down';

  return (
    <div className="ui-row ui-row--wl">
      <Link className="ui-row-main" to={`/chart/${item.symbol.id}`}>
        <span className="ui-row-title">{item.symbol.ticker}</span>
        <span className="ui-row-sub">{item.symbol.exchange}</span>
      </Link>
      <div className="ui-row-end">
        <span className={`ui-row-value price-flash ${flash}`}>
          {price != null ? compact.format(price) : historyQ.isLoading ? '·' : '–'}
        </span>
        {change != null && <span className={`ui-row-delta ${tone}`}>{pct.format(change)}</span>}
      </div>
      <button className="icon-btn wl-row-remove" onClick={onRemove} title="Remove" aria-label="Remove">
        <IconClose size={13} />
      </button>
    </div>
  );
}

export function WatchlistDock() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [listId, setListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [addSym, setAddSym] = useState('');

  const listsQ = useQuery({ queryKey: ['watchlists'], queryFn: () => api.watchlists() });
  const lists = listsQ.data?.watchlists ?? [];
  const activeId = listId ?? lists[0]?.id ?? null;

  const itemsQ = useQuery({
    queryKey: ['watchlist-items', activeId],
    queryFn: () => api.watchlistItems(activeId!),
    enabled: !!activeId,
  });
  const items = itemsQ.data?.items ?? [];

  const quoteSymbols: QuoteSymbol[] = useMemo(
    () => items.map((i) => ({ id: i.symbol.id, exchange: i.symbol.exchange, ticker: i.symbol.ticker })),
    [items],
  );
  const { quotes } = useMarketQuotes(quoteSymbols);

  const reloadLists = () => qc.invalidateQueries({ queryKey: ['watchlists'] });
  const reloadItems = () => qc.invalidateQueries({ queryKey: ['watchlist-items', activeId] });

  const createList = async () => {
    const name = newName.trim();
    if (!name) return;
    const { id } = await api.createWatchlist(name);
    setNewName('');
    setCreating(false);
    setListId(id);
    await reloadLists();
  };
  const deleteList = async () => {
    if (!activeId) return;
    await api.deleteWatchlist(activeId);
    setListId(null);
    await reloadLists();
  };
  const addSymbol = async () => {
    const sym = addSym.trim();
    if (!sym || !activeId) return;
    await api.addToWatchlist(activeId, sym);
    setAddSym('');
    await reloadItems();
  };
  const removeItem = async (itemId: string) => {
    if (!activeId) return;
    await api.removeFromWatchlist(activeId, itemId);
    await reloadItems();
  };

  return (
    <Dock
      title="Watchlist"
      icon={<IconStar size={14} />}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      actions={
        <button
          className="icon-btn"
          onClick={() => setCreating((c) => !c)}
          title="New list"
          aria-label="New list"
        >
          <IconPlus size={14} />
        </button>
      }
    >
      <div className="wl-dock-tools">
        <select value={activeId ?? ''} onChange={(e) => setListId(e.target.value || null)}>
          {lists.length === 0 && <option value="">No lists</option>}
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {activeId && (
          <button className="icon-btn" onClick={() => void deleteList()} title="Delete list">
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {creating && (
        <div className="wl-dock-add">
          <input
            value={newName}
            autoFocus
            placeholder="List name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createList()}
          />
          <button className="icon-btn" onClick={() => void createList()} title="Create">
            <IconPlus size={14} />
          </button>
        </div>
      )}

      {activeId && (
        <div className="wl-dock-add">
          <input
            value={addSym}
            placeholder="Add symbol…"
            onChange={(e) => setAddSym(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addSymbol()}
          />
          <button className="icon-btn" onClick={() => void addSymbol()} title="Add">
            <IconPlus size={14} />
          </button>
        </div>
      )}

      <div className="ui-list">
        {items.map((item) => (
          <WatchRow
            key={item.id}
            item={item}
            quote={quotes[quoteKey(item.symbol)]}
            onRemove={() => void removeItem(item.id)}
          />
        ))}
        {items.length === 0 && <div className="ui-dock-empty">No symbols</div>}
      </div>
    </Dock>
  );
}
