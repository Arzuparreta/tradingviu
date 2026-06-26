# Slice 2.5 — Real-time Market Data Infrastructure

> **Why this slice exists.** Slice 2 (`39a6465`) shipped live bars via per-client CCXT polling, gated by `if (time > lastTime)` which silently dropped in-progress bar updates. Result: 1m charts don't animate, every client opens its own poll loop, no historical pagination, no persistence. This slice replaces the data layer with a single upstream-per-symbol server-side `BarStore`, a TimescaleDB hypertable for persistence, paginated history, and an in-progress-bar aware WS protocol. Slice 2's broken live bars are deprecated.

## Later hardening: Binance real-time end-to-end

After live testing against Binance, the chart path was hardened further:

- Binance historical data uses native REST klines. CCXT remains the fallback for non-Binance providers.
- Binance bar rows use canonical exchange tickers such as `BTCUSDT`. Migration `0010_normalize_binance_bar_symbols.sql` merges legacy slash-form rows.
- `market-data.ts` centralizes freshness-aware historical bars so chart history, indicators, patterns, profiles, Pine, backtests, alerts, and portfolio analytics read the same fresh series.
- `market-store.ts` adds real Binance `bookTicker` and `depth20@100ms` streams, plus REST depth snapshots for `/api/chart/dom`.
- The WS protocol adds `subscribe_market`, `market_status`, `quote`, and `book` for live price and DOM updates.
- The chart UI uses the history cache as its candle source of truth; live bars upsert that cache and `loadNewer` gap-fills before far-ahead bars are inserted.

## Goals

1. **One upstream per (provider, ticker, interval)** regardless of how many clients are watching. N clients → 1 connection to the exchange.
2. **In-progress bars animate** at native speed. Binance native WS gives ~250ms updates; CCXT polling at 1s.
3. **In-memory ring buffer per key** (last 5,000 bars) for instant first paint.
4. **Persisted to TimescaleDB** on bar close. Survives server restart.
5. **Paginated history** — `?before=<ts>&limit=N` for infinite scroll-left.
6. **Range query falls back to exchange** for the gap between DB latest and "now".
7. **Status events** to clients (connecting / live / reconnecting / down) so the UI can show a TV-grade "Live · 250ms" badge.
8. **Timezone-correct** charts — bar `time` stays UTC, chart displays local.

## Non-goals (deferred)

- True tick-level data (slice 9c volume footprint already mentions it — needs trade stream).
- Multi-exchange aggregation. Each (provider, ticker) is its own stream.
- Symbol subscription prefetch. First client to ask pays the backfill cost.
- Per-tenant bar filtering. Bars are global, like `symbols` and `news_articles`. Quota on **range size** and **concurrent streams** per tenant, not on data access.

## Architecture

```
                     ┌──────────────────────────────────────┐
                     │  apps/server (Bun process)          │
                     │                                      │
[Binance WS]         │  ┌──────────────────────┐             │  WS fanout
 ─── kline@1m ──────┼─▶│  BarStore            │── pub ──────┼──▶ N browser
                     │  │  ring buf 5k/key     │             │     WS conns
                     │  │  ref-counted upstr   │             │
                     │  └────────┬─────────────┘             │
                     │           │ close-event               │
                     │           ▼                            │
                     │  ┌──────────────────────┐             │
                     │  │  PersistQueue        │             │
                     │  └────────┬─────────────┘             │
                     └───────────┼──────────────────────────┘
                                 ▼
                       [ TimescaleDB hypertable `bars` ]
                                 ▲
                                 │ read on demand
                                 │
[GET /api/chart/history] ────────┘
                                 ▲
                                 │ range query
                                 │
[Browser useChartHistory] ───────┘
```

### Component map

| Component | File | Purpose |
|---|---|---|
| `BarStore` | `apps/server/src/services/bar-store.ts` | Ring buffer + ref-counted upstream + range query |
| `PersistQueue` | `apps/server/src/services/persist-queue.ts` | Batched writes to `bars` table on bar close |
| `BinanceNativeStream` | `apps/server/src/services/streams/binance.ts` | Native WS `wss://stream.binance.com:9443/ws/<sym>@kline_<tf>` (preferred) |
| `CcxtStream` | `apps/server/src/services/streams/ccxt.ts` | CCXT `watchOHLCV` or polling fallback (used by Coinbase/Kraken/Bybit) |
| `chartRoutes` (patched) | `apps/server/src/routes/symbols.ts` | `/api/chart/history?before=&after=&limit=` |
| `wsHandlers` (refactored) | `apps/server/src/services/ws.ts` | Fans out from `BarStore`, emits `status` events |
| `useChartHistory` | `apps/web/src/hooks/use-chart-history.ts` | Paginated React hook |
| `useBarStream` | `apps/web/src/hooks/use-bar-stream.ts` | WS subscription with status |
| `tools/backfill-bars` | `tools/backfill-bars/src/index.ts` | CLI for initial seed + replay |

## Schema

New global table. **No `tenant_id`**. **RLS: read public, write super_admin** (like `symbols`, `news_articles`).

```sql
-- 0007_market_bars.sql
CREATE TABLE bars (
  provider   text NOT NULL,             -- 'binance' | 'coinbase' | ...
  ticker     text NOT NULL,             -- 'BTCUSDT' for Binance; provider-native canonical form
  interval   text NOT NULL,             -- '1m' | '5m' | ... (Interval)
  time       bigint NOT NULL,           -- unix seconds (UTC)
  open       double precision NOT NULL,
  high       double precision NOT NULL,
  low        double precision NOT NULL,
  close      double precision NOT NULL,
  volume     double precision NOT NULL DEFAULT 0,
  trades     bigint,
  is_closed  boolean NOT NULL DEFAULT true,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, ticker, interval, time)
);

-- TimescaleDB hypertable, 1-day chunks
SELECT create_hypertable('bars', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE);

CREATE INDEX bars_lookup_idx
  ON bars (provider, ticker, interval, time DESC);

-- RLS: public read, super_admin write
ALTER TABLE bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE bars FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bars_read ON bars;
CREATE POLICY bars_read ON bars FOR SELECT USING (true);
DROP POLICY IF EXISTS bars_write ON bars;
CREATE POLICY bars_write ON bars FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());
```

Unique constraint on `(provider, ticker, interval, time)` makes writes idempotent — safe to replay backfill, safe to re-emit the same bar.

## BarStore API

```ts
// apps/server/src/services/bar-store.ts

export interface BarStreamKey {
  provider: string;   // 'binance' | 'coinbase' | ...
  ticker: string;     // 'BTCUSDT' for Binance; provider-native canonical form
  interval: Interval;
}

export type BarEvent =
  | { kind: 'update'; bar: Bar }   // in-progress bar, overwrite last
  | { kind: 'close';  bar: Bar }   // bar just closed, append
  | { kind: 'status'; status: StreamStatus; message?: string };

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'idle';

export interface BarStore {
  /** Subscribe to live events. Returns unsubscribe + status. */
  subscribe(key: BarStreamKey, cb: (e: BarEvent) => void): () => void;

  /** Last N bars in memory. Empty if stream not active. */
  getRecent(key: BarStreamKey, limit: number): Bar[];

  /** Bars in [from, to] window. to inclusive, from inclusive. ASC order. */
  getRange(key: BarStreamKey, opts: { from?: number; to?: number; limit: number }): Promise<Bar[]>;

  /** Force a stream open (warmup the buffer + DB backfill). */
  ensureStream(key: BarStreamKey): Promise<void>;

  /** Drop an idle stream immediately. */
  evict(key: BarStreamKey): void;

  /** Diagnostics for /api/health. */
  stats(): { keys: number; listeners: number; status: Record<string, StreamStatus> };
}
```

Internal state:
```
Map<keyString, {
  buffer: RingBuffer<Bar>          // cap 5000
  listeners: Set<BarCallback>
  refCount: number                // number of active subscribers
  status: StreamStatus
  upstream: { close(): void } | null
  idleTimer: Timer | null         // close upstream 60s after refCount=0
  backfilled: boolean             // has the initial REST backfill run?
  lastClosedAt: number            // time of last CLOSED bar
}>
```

### Activation rules

- `subscribe`: `refCount++`. If `refCount` was 0, call `ensureStream()` (opens upstream, starts backfill if not done).
- `unsubscribe` (the returned fn): `refCount--`. If `refCount` becomes 0, set `idleTimer` for 60s. On timer fire, call `upstream.close()` and mark `backfilled = false` so a re-subscribe re-backfills.

### Backfill

When a stream opens for the first time (or after eviction):
1. Fetch last 1000 bars from `provider.fetchHistorical({ interval, limit: 1000 })`.
2. Write to DB with `INSERT … ON CONFLICT DO NOTHING`.
3. Seed ring buffer with the same 1000 bars.
4. Mark `backfilled = true`.

The next time this stream opens, skip the REST fetch and go straight to opening the WS.

### In-progress bar detection (CCXT polling)

- Keep a `lastSeenTime` per stream.
- On every poll: read latest bar from exchange.
- If `bar.time > lastSeenTime`: the previous in-progress bar just closed → emit `{kind: 'close', bar: prevBar}` and persist. Then emit `{kind: 'update', bar: bar}` for the new in-progress one.
- If `bar.time === lastSeenTime`: the bar is the same one we already have → emit `{kind: 'update', bar: bar}` (overwrites).
- If `bar.time < lastSeenTime`: stale (rare), ignore.

### In-progress bar detection (Binance native WS)

- The kline event has `k.x: boolean` — `true` means the bar just closed.
- On every event:
  - If `k.x === false`: emit `{kind: 'update', bar: fromKline(k)}`.
  - If `k.x === true`: emit `{kind: 'close', bar: fromKline(k)}` (and persist).

## Provider stream

Two implementations:

### BinanceNativeStream (preferred for Binance)

```ts
// apps/server/src/services/streams/binance.ts
const url = (sym: string, tf: string) =>
  `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`;

class BinanceNativeStream {
  constructor(private key: BarStreamKey) {}
  start(onEvent: (e: BarEvent) => void): () => void { /* WS, parse, dispatch */ }
  status(): StreamStatus { return this.ws?.readyState === 1 ? 'live' : 'reconnecting'; }
}
```

Benefits over CCXT:
- ~250ms update latency (CCXT polling is 1000ms).
- `k.x` gives explicit close signal.
- No rate limit pressure (1 connection per symbol+interval, persistent).

### CcxtStream (fallback for Coinbase/Kraken/Bybit)

```ts
class CcxtStream {
  constructor(private key: BarStreamKey, private provider: CcxtProvider) {}
  start(onEvent: (e: BarEvent) => void): () => void {
    if (this.provider.exchange.has['watchOHLCV']) {
      return this.watchOhlcv(onEvent);
    }
    return this.poll(onEvent);  // 1s polling, but emits in-progress correctly
  }
}
```

`watchOhlcv` uses `ccxt.pro` style — not all exchanges support it, hence the polling fallback. Polling now emits `{kind: 'update'}` on every poll when the bar is the same time.

## WebSocket protocol changes

**Server → client** (additions, no breaking changes):

```ts
// new: stream status
{ type: 'status', symbol, interval, status: 'connecting'|'live'|'reconnecting'|'down', message? }

// existing: bar (now also emitted for in-progress via 'update' on the same ws.send shape)
//   We re-use the existing 'bar' event but add a `phase` field:
{ type: 'bar', symbol, interval, bar, phase: 'update' | 'close' }
//   phase='update' → client should series.update() (overwrite)
//   phase='close'  → client should series.update() and append to history state
```

`phase` defaults to `close` when omitted (back-compat with existing clients).

**Client → server** (additions):

```ts
// existing: subscribe, unsubscribe, ping, auth
// new: request a historical range on demand
{ type: 'range', symbol, interval, from, to, limit }
```

`range` response:
```ts
{ type: 'range', symbol, interval, from, to, bars: Bar[] }
```

This is an alternative to HTTP for clients that want to keep the WS connection as the only data path. HTTP `/api/chart/history` stays for first paint and SSR.

## API changes

### `GET /api/chart/history`

Query:
- `symbol` (req)
- `interval` (req, same enum as before)
- `before` (opt) — return bars with `time < before` (newest-first iteration, returned ASC)
- `after`  (opt) — return bars with `time > after`
- `limit`  (opt, default 500, max 5000)

Semantics:
1. If `BarStore.getRecent` has enough bars for the requested window, return from ring buffer.
2. Else query `bars` table (DB) for the range.
3. If the latest DB bar is older than `now - 1m` and no upstream for this key, fetch from exchange to fill the gap.
4. Return `{ symbol, interval, bars: Bar[] }` ASC.

For `before`-based pagination (infinite scroll), the typical request is `?before=<timeOfLeftmostLoadedBar>&limit=500`. The endpoint returns 500 bars older than that.

### New: `GET /api/chart/status`

Optional diagnostic endpoint, returns:
```ts
{ streams: Array<{ provider, ticker, interval, status, listeners, lastClosedAt, buffered }> }
```

## Client changes

### `useChartHistory` hook

```ts
// apps/web/src/hooks/use-chart-history.ts
export function useChartHistory(opts: {
  symbolId: string | null;
  interval: Interval;
  pageSize?: number;       // default 500
}) {
  // returns: { bars, isLoading, hasMore, loadMore, error }
  // - first call: /api/chart/history?limit=pageSize  (latest)
  // - loadMore(before): /api/chart/history?before=&limit=pageSize  (prepend)
  // - bars is deduped + sorted ASC
}
```

### `useBarStream` hook

```ts
// apps/web/src/hooks/use-bar-stream.ts
export function useBarStream(opts: {
  symbolId: string | null;
  exchange: string;
  ticker: string;
  interval: Interval;
}): { status: StreamStatus; lastBar: Bar | null; lastUpdate: number | null }
```

Connects to `/ws?token=…`, sends `subscribe`, listens for `bar` (with `phase`) and `status`. Exposes the stream status so `ChartPage` can render a "Live · 250ms" badge.

### `ChartPage` integration

- Replace the inline `useQuery(['history', ...])` and the WS effect with the two hooks.
- `useEffect` on `chart.subscribeVisibleTimeRangeChange`: when the leftmost visible time approaches the buffer's left edge, call `loadMore(earliestBar.time)`.
- On `bar` WS event:
  - If `phase === 'update'`: `series.update()` on the candle + volume series with the new bar.
  - If `phase === 'close'`: append to React state + `series.update()`.
- Show a status pill in the toolbar: `🟢 Live · 250ms` / `🟡 Connecting…` / `🔴 Reconnecting in 2s`.

## chart-engine changes

- `createTvChart` accepts a `timezone` option, defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- New export: `subscribeVisibleTimeRange(chart, cb)` — typed wrapper around `chart.timeScale().subscribeVisibleTimeRangeChange` for ergonomics.

## Backfill CLI

`tools/backfill-bars/src/index.ts` — `pnpm backfill:bars`

```bash
pnpm backfill:bars --provider binance --ticker BTCUSDT --interval 1m --limit 1000
pnpm backfill:bars --provider binance --all --intervals 1m,5m,1h,1d --limit 1000
```

- Idempotent: `ON CONFLICT DO NOTHING` on `(provider, ticker, interval, time)`.
- Used for: first-time seed of a new symbol, replay after data corruption, replays for backtest seeds.
- Does **not** affect the in-memory BarStore — that's a runtime concern.

## File changes summary

```
packages/db/
  src/schema/market.ts                    # add `bars` table
  drizzle/0007_market_bars.sql            # generated migration
  src/rls-policies.ts                     # add bars_read / bars_write

packages/data-adapters/
  src/provider.ts                         # BarEvent type, no breaking change
  src/ccxt/binance.ts                     # emit 'update' on every poll
  src/ccxt/binance.test.ts                # update tests for in-progress

apps/server/src/
  services/
    bar-store.ts                          # NEW
    persist-queue.ts                      # NEW
    streams/binance.ts                    # NEW
    streams/ccxt.ts                       # NEW
    ws.ts                                 # refactor to BarStore fanout
    data.ts                               # register streams
  routes/
    symbols.ts                            # /api/chart/history paginated
  index.ts                                # boot BarStore + PersistQueue

apps/web/src/
  pages/ChartPage.tsx                     # wire hooks + visible-range loadMore
  hooks/use-chart-history.ts              # NEW
  hooks/use-bar-stream.ts                 # NEW

packages/chart-engine/src/
  index.ts                                # timezone default + subscribeVisibleTimeRange

tools/backfill-bars/
  src/index.ts                            # NEW CLI
  package.json
  tsconfig.json
```

## Tests

| Test | Type | What it asserts |
|---|---|---|
| `bar-store.test.ts` | unit | ring buffer eviction, ref-count activation, backfill idempotency, range query fallback |
| `binance.test.ts` (extended) | unit | `subscribe` emits `update` for in-progress bars with same time |
| `ccxt-stream.test.ts` | unit | polling detects close on time change, in-progress emit on same time |
| `persist-queue.test.ts` | unit | batched writes, idempotency, retry on transient error |
| `chart-history.test.ts` (e2e) | api | 2 paginated calls stitch a contiguous range |
| `ws-fanout.test.ts` (e2e) | api | 3 WS clients on BTCUSDT 1m → 1 upstream stream, identical bar stream |
| `backfill-bars.test.ts` (integration) | cli | re-running with same args is a no-op |

## Migration plan

1. Add migration `0007_market_bars.sql` with the table + hypertable + RLS. The Drizzle meta `_journal.json` is updated with the new entry. The corresponding `0007_snapshot.json` is **not** hand-written — after `pnpm db:migrate` runs the SQL, run `pnpm db:generate` once to refresh Drizzle's internal snapshot for future diffs. (The migration SQL is self-contained; the snapshot file is only used by `drizzle-kit` to compute the next diff.)
2. Deploy server with the new BarStore. Old CCXT polling code stays as fallback if `BAR_STORE_ENABLED=false` env var is set (kill-switch for prod rollouts).
3. Run `pnpm backfill:bars --provider binance --ticker BTCUSDT,ETHUSDT,SOLUSDT --intervals 1m,5m,1h --limit 1000` to seed the most-watched pairs.
4. Switch the default to `BAR_STORE_ENABLED=true`.
5. Remove the old per-client `provider.subscribe` from `ws.ts` (it's no longer called).
6. Bump the `CHART_PROTOCOL_VERSION` constant in `ws-protocol.ts` to `2`.

## Risks

| Risk | Mitigation |
|---|---|
| Binance WS rate limit on many symbols | 1 connection per symbol+interval (we only open what's needed). For >100 active streams, evaluate combined stream `wss://stream.binance.com:9443/stream?streams=...` |
| Bar corrections after close | Binance can correct the last few minutes. Re-emit on every `k.x=true` and on subsequent `k.x=false` for the next bar (overwrites are cheap). |
| DB write storm on second boundaries (all 1m streams close at :00) | `PersistQueue` batches by interval close group + 100ms flush window. |
| Server restart drops in-memory buffer | `BarStore` re-warms from DB on first subscribe, then backfills from exchange for the gap. Sub-second cold start for popular pairs after restart. |
| Multi-process server (PM2/cluster) | Out of scope for v1. `BarStore` is per-process. For multi-process, swap in Redis pub/sub fanout (deferred). |

## Success criteria

- 1 Binance WS per (symbol, interval) globally, verified by `/api/chart/status`.
- 1m chart animates within 1s of bar updates.
- Pagination works: open 1m chart, scroll left, data continues to load until exchange limit.
- 2 clients viewing BTC 1m → identical bar stream (e2e test).
- Server restart: popular pairs warm from DB in <1s, exchange backfill fills the gap.
- `pnpm backfill:bars` is idempotent and re-runnable.
- All existing tests still pass (slice 3-9 untouched).
