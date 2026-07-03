import { expect, test, type Locator, type Page } from '@playwright/test';
import type { LayoutConfig } from '@tv/layout-sync';
import type { AlertRow, Symbol as TvSymbol, Watchlist, WatchlistItem } from '../src/api/types';

const user = {
  id: 'usr_e2e',
  email: 'e2e@example.com',
  displayName: 'E2E User',
  createdAt: '2026-06-27T00:00:00.000Z',
};

const btc = {
  id: 'BTCUSDT',
  exchange: 'BINANCE',
  ticker: 'BTCUSDT',
  name: 'Bitcoin / Tether',
  assetClass: 'crypto',
  currency: 'USDT',
  active: true,
};

const apple = {
  id: 'AAPL',
  exchange: 'NASDAQ',
  ticker: 'AAPL',
  name: 'Apple Inc.',
  assetClass: 'stock',
  currency: 'USD',
  active: true,
};

const symbols = [btc, apple];

const screenerTickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META'] as const;

const screenerResults = screenerTickers.map((ticker, index) => ({
  id: ticker,
  ticker,
  name: ticker === apple.ticker ? apple.name : `${ticker} Mock Equity`,
  assetClass: 'stock',
  currency: 'USD',
  country: 'US',
  sector: index < 3 ? 'Technology' : 'Communication Services',
  industry: 'Listed equity',
  active: true,
  exchange: 'NASDAQ',
  metrics: {
    marketCap: 3_200_000_000_000 - index * 300_000_000_000,
    peRatio: 30 + index,
    revenueGrowth: 0.08 + index * 0.01,
  },
}));

const manySymbols: TvSymbol[] = Array.from({ length: 48 }, (_, index) => ({
  id: `SYM${index}`,
  exchange: 'NASDAQ',
  ticker: `SYM${index}`,
  name: `Scrollable Mock Equity ${index}`,
  assetClass: 'stock',
  currency: 'USD',
  active: true,
}));

const manyWatchlists: Watchlist[] = Array.from({ length: 48 }, (_, index) => ({
  id: `wl_${index}`,
  name: `Long watchlist ${index + 1}`,
  createdAt: '2026-06-27T00:00:00.000Z',
  updatedAt: '2026-06-27T00:00:00.000Z',
}));

const manyWatchlistItems: WatchlistItem[] = manySymbols.map((symbol, index) => ({
  id: `wli_${index}`,
  symbolId: symbol.id,
  color: null,
  note: index % 2 === 0 ? 'High priority monitored symbol' : null,
  sortOrder: index,
  symbol: {
    id: symbol.id,
    ticker: symbol.ticker,
    name: symbol.name,
    exchange: symbol.exchange,
  },
}));

const manyAlerts: AlertRow[] = manySymbols.map((symbol, index) => ({
  id: `alert_${index}`,
  symbolId: symbol.id,
  name: `Alert ${index + 1}`,
  kind: 'price',
  condition: { type: 'price', operator: 'above', value: 100 + index },
  channels: ['in_app'],
  webhookUrl: null,
  active: index % 3 !== 0,
  expiresAt: null,
  lastFiredAt: null,
  createdAt: '2026-06-27T00:00:00.000Z',
  updatedAt: '2026-06-27T00:00:00.000Z',
  symbol: {
    id: symbol.id,
    ticker: symbol.ticker,
    name: symbol.name,
    exchange: symbol.exchange,
  },
}));

const bars = Array.from({ length: 180 }, (_, index) => {
  const base = 100 + Math.sin(index / 9) * 4 + index * 0.08;
  return {
    time: 1_735_689_600 + index * 3_600,
    open: base,
    high: base + 3,
    low: base - 3,
    close: base + Math.sin(index / 3),
    volume: 1_000 + index * 7,
  };
});

const layoutConfig = {
  grid: '2',
  panels: [
    {
      id: 'panel_left',
      drawingScopeId: 'scope_left',
      symbolId: 'BTCUSDT',
      interval: '1h',
      indicators: [],
    },
    {
      id: 'panel_right',
      drawingScopeId: 'scope_right',
      symbolId: 'AAPL',
      interval: '1h',
      indicators: [],
    },
  ],
  sync: { symbol: false, interval: false, crosshair: true },
  activePanel: 0,
} satisfies LayoutConfig;

interface DrawingE2EState {
  panelId: string;
  active: boolean;
  overlayCount: number;
  selectedId: string | null;
  hoveredId: string | null;
  activeTool: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

interface ExpectedDrawingState {
  overlayCount?: number;
  selected?: boolean;
  hovered?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

interface AppMockOptions {
  watchlists?: readonly Watchlist[];
  watchlistItems?: readonly WatchlistItem[];
  alerts?: readonly AlertRow[];
  searchResults?: readonly TvSymbol[];
  onHistoryRequest?: (params: { symbol: string; interval: string }) => void;
}

const installAppMocks = async (page: Page, options: AppMockOptions = {}) => {
  const watchlists = options.watchlists ?? [];
  const watchlistItems = options.watchlistItems ?? [];
  const alerts = options.alerts ?? [];
  const searchResults = options.searchResults ?? symbols;
  const onHistoryRequest = options.onHistoryRequest;

  await page.addInitScript(() => {
    localStorage.setItem('tv_token', 'e2e-token');

    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly url: string;
      readonly protocol = '';
      readonly extensions = '';
      readonly binaryType = 'blob';
      readyState = MockWebSocket.CONNECTING;
      bufferedAmount = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string | URL) {
        super();
        const e2eWindow = window as Window & { __TV_E2E_SOCKETS__?: MockWebSocket[] };
        e2eWindow.__TV_E2E_SOCKETS__ = [...(e2eWindow.__TV_E2E_SOCKETS__ ?? []), this];
        this.url = String(url);
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send(_raw: string | ArrayBufferLike | Blob | ArrayBufferView) {
        return undefined;
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const event = new CloseEvent('close');
        this.dispatchEvent(event);
        this.onclose?.(event);
      }
    }

    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    const fulfillJson = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (url.pathname === '/auth/me') {
      await fulfillJson({ user });
      return;
    }

    if (url.pathname === '/api/symbols' || url.pathname === '/api/symbols/search') {
      const query = url.searchParams.get('q')?.toLowerCase() ?? '';
      await fulfillJson({
        results: query
          ? symbols.filter((symbol) => symbol.ticker.toLowerCase().includes(query))
          : symbols,
      });
      return;
    }

    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q')?.toLowerCase() ?? '';
      await fulfillJson({
        results: searchResults.filter(
          (symbol) =>
            symbol.ticker.toLowerCase().includes(query) ||
            symbol.name.toLowerCase().includes(query),
        ),
        backend: 'db',
      });
      return;
    }

    if (url.pathname === '/api/chart/history') {
      const symbolId = url.searchParams.get('symbol') ?? 'BTCUSDT';
      const interval = url.searchParams.get('interval') ?? '1h';
      onHistoryRequest?.({ symbol: symbolId, interval });
      const symbol =
        symbols.find((item) => item.id === symbolId || item.ticker === symbolId) ?? btc;
      await fulfillJson({
        symbol,
        interval,
        bars,
        fresh: true,
      });
      return;
    }

    if (url.pathname === '/api/layouts') {
      await fulfillJson({
        layouts: [
          {
            id: 'lay_e2e',
            name: 'Two panel E2E',
            isDefault: true,
            config: layoutConfig,
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/watchlists') {
      await fulfillJson({ watchlists });
      return;
    }

    if (/^\/api\/watchlists\/[^/]+\/items$/.test(url.pathname)) {
      await fulfillJson({ items: watchlistItems });
      return;
    }

    if (url.pathname === '/api/alerts') {
      await fulfillJson({ alerts });
      return;
    }

    if (url.pathname === '/api/drawings') {
      await fulfillJson({ drawings: [] });
      return;
    }

    if (url.pathname === '/api/news') {
      await fulfillJson({
        articles: [
          {
            id: 'news_1',
            source: 'MockWire',
            url: 'https://example.com/news/apple-ai-cycle',
            title: 'Apple suppliers lift guidance on AI device cycle',
            body: 'Semiconductor and consumer hardware names moved after updated supplier commentary.',
            symbols: ['AAPL', 'NVDA'],
            sentiment: 'positive',
            publishedAt: '2026-06-29T09:00:00.000Z',
            fetchedAt: '2026-06-29T09:05:00.000Z',
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/calendars/economic') {
      await fulfillJson({
        events: [
          {
            id: 'econ_1',
            country: 'US',
            eventAt: '2026-07-01T12:30:00.000Z',
            name: 'ISM Manufacturing PMI',
            importance: 'high',
            actual: null,
            forecast: '50.7',
            previous: '49.9',
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/calendars/earnings') {
      await fulfillJson({
        events: [
          {
            id: 'earn_1',
            date: '2026-07-02',
            epsEstimate: '2.11',
            epsActual: null,
            revenueEstimate: '96.2B',
            revenueActual: null,
            symbol: apple,
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/calendars/dividends') {
      await fulfillJson({ events: [] });
      return;
    }

    if (url.pathname === '/api/macro/yield-curves') {
      await fulfillJson({
        points: [
          {
            id: 'yc_3m',
            country: 'US',
            curveDate: '2026-06-29',
            tenorMonths: 3,
            rate: 4.9,
            currency: 'USD',
            source: 'mock',
            fetchedAt: '2026-06-29T09:00:00.000Z',
          },
          {
            id: 'yc_10y',
            country: 'US',
            curveDate: '2026-06-29',
            tenorMonths: 120,
            rate: 4.2,
            currency: 'USD',
            source: 'mock',
            fetchedAt: '2026-06-29T09:00:00.000Z',
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/macro/series') {
      await fulfillJson({
        observations: [
          {
            id: 'macro_1',
            country: 'US',
            metricCode: 'CPI',
            metricName: 'Consumer Price Index',
            observedAt: '2026-06-01',
            value: 3.1,
            unit: '%',
            frequency: 'monthly',
            source: 'mock',
            fetchedAt: '2026-06-29T09:00:00.000Z',
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/fundamentals') {
      await fulfillJson({
        snapshots: [
          {
            id: 'fund_1',
            fiscalPeriod: 'ttm',
            periodEnd: '2026-06-29',
            source: 'mock',
            currency: 'USD',
            isLatest: true,
            marketCap: 3_200_000_000_000,
            peRatio: 31.4,
            eps: 7.1,
            revenue: 420_000_000_000,
            dividendYield: 0.004,
            roe: 1.1,
            revenueGrowth: 0.08,
            earningsGrowth: 0.12,
            beta: 1.2,
            week52High: 235,
            week52Low: 164,
            fetchedAt: '2026-06-29T09:00:00.000Z',
            symbol: apple,
          },
        ],
      });
      return;
    }

    if (url.pathname === '/api/screener' && request.method() === 'POST') {
      await fulfillJson({
        results: screenerResults,
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await fulfillJson({});
      return;
    }

    await route.continue();
  });
};

const expectContainedVerticalScroll = async (locator: Locator, rightEdgeSelector?: string) => {
  const metrics = await locator.evaluate((node, selector) => {
    if (!(node instanceof HTMLElement)) return null;
    const nodeRect = node.getBoundingClientRect();
    const rightEdge = selector ? node.querySelector(selector) : null;
    const rightRect = rightEdge instanceof HTMLElement ? rightEdge.getBoundingClientRect() : null;
    const style = window.getComputedStyle(node);

    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: style.overflowY,
      scrollbarGutter: style.scrollbarGutter,
      scrollbarWidth: style.scrollbarWidth,
      gutterWidth: node.offsetWidth - node.clientWidth,
      clientRight: nodeRect.left + node.clientWidth,
      rightEdgeRight: rightRect?.right ?? null,
    };
  }, rightEdgeSelector);

  expect(metrics).not.toBeNull();
  if (metrics == null) return;
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollbarGutter).toContain('stable');
  expect(['auto', 'thin']).toContain(metrics.scrollbarWidth);
  expect(metrics.gutterWidth).toBeGreaterThanOrEqual(10);
  if (metrics.rightEdgeRight != null) {
    expect(metrics.rightEdgeRight).toBeLessThanOrEqual(metrics.clientRight + 1);
  }
};

const waitForDrawingState = async (page: Page, expected: ExpectedDrawingState) => {
  await page.waitForFunction((wanted: ExpectedDrawingState) => {
    const registry = (window as Window & { __TV_E2E_DRAWINGS__?: Record<string, DrawingE2EState> })
      .__TV_E2E_DRAWINGS__;
    const state = registry?.active;
    if (!state) return false;
    if (wanted.overlayCount !== undefined && state.overlayCount !== wanted.overlayCount) {
      return false;
    }
    if (wanted.selected !== undefined && (state.selectedId != null) !== wanted.selected) {
      return false;
    }
    if (wanted.hovered !== undefined && (state.hoveredId != null) !== wanted.hovered) {
      return false;
    }
    if (wanted.canUndo !== undefined && state.canUndo !== wanted.canUndo) {
      return false;
    }
    if (wanted.canRedo !== undefined && state.canRedo !== wanted.canRedo) {
      return false;
    }
    return true;
  }, expected);
};

const chartPoint = async (page: Page, xRatio: number, yRatio: number) => {
  const box = await page.locator('.kline-core').first().boundingBox();
  if (box == null) throw new Error('Expected chart bounding box');
  return {
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio,
  };
};

const emitMockRealtimeBar = async (page: Page) => {
  const emitted = await page.evaluate(() => {
    const e2eWindow = window as Window & {
      __TV_E2E_SOCKETS__?: Array<
        EventTarget & {
          onmessage: ((event: MessageEvent) => void) | null;
        }
      >;
    };
    const socket = e2eWindow.__TV_E2E_SOCKETS__?.at(-1);
    if (!socket) return false;
    const event = new MessageEvent('message', {
      data: JSON.stringify({
        type: 'bar',
        symbol: 'BINANCE:BTCUSDT',
        interval: '1h',
        bar: {
          time: 1_735_689_600 + 181 * 3_600,
          open: 116,
          high: 119,
          low: 113,
          close: 117,
          volume: 2_800,
        },
      }),
    });
    socket.dispatchEvent(event);
    socket.onmessage?.(event);
    return true;
  });
  expect(emitted).toBe(true);
};

const drawTwoPointOverlay = async (page: Page, toolName: string) => {
  await expect(page.locator('.kline-core').first()).toHaveAttribute('data-loading', 'false');
  await page.getByRole('button', { name: toolName, exact: true }).click();
  const start = await chartPoint(page, 0.32, 0.36);
  const end = await chartPoint(page, 0.63, 0.56);
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(end.x, end.y);
  await waitForDrawingState(page, { overlayCount: 1, selected: true, canUndo: true });
  return {
    start,
    end,
    mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
};

test('chart route renders the core KLine chart surface', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  const chart = page.locator('.kline-core').first();
  await expect(page.locator('.ws-symbol')).toContainText('BTCUSDT');
  await expect(page.getByRole('button', { name: 'Trend line' })).toBeVisible();
  await expect(chart).toHaveAttribute('data-symbol', 'BTCUSDT');
  await expect(chart).toHaveAttribute('data-interval', '1h');
  await expect(chart).toHaveAttribute('data-loading', 'false');
  await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(0);
});

test('legacy chart aliases collapse to the canonical chart', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart-legacy/BTCUSDT');

  await expect(page).toHaveURL(/\/chart\/BTCUSDT$/);
  await expect(page.locator('.ws-symbol')).toContainText('BTCUSDT');
  await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(0);
});

test('chart controls keep symbol and interval wired through rapid changes', async ({ page }) => {
  const historyRequests: Array<{ symbol: string; interval: string }> = [];
  await installAppMocks(page, {
    onHistoryRequest: (params) => historyRequests.push(params),
  });
  await page.goto('/chart/BTCUSDT');

  const chart = page.locator('.kline-core').first();
  await expect(chart).toHaveAttribute('data-loading', 'false');
  await expect(chart).toHaveAttribute('data-symbol', 'BTCUSDT');

  for (const interval of ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '5m', '1m', '1h']) {
    await page.getByRole('tab', { name: interval, exact: true }).click();
    await expect(chart).toHaveAttribute('data-interval', interval);
    await expect(chart).toHaveAttribute('data-loading', 'false');
  }

  await page.getByRole('button', { name: /Search symbols or jump to/ }).click();
  await expect(page.getByPlaceholder('Search symbols or jump to…')).toBeVisible();
  await page.getByPlaceholder('Search symbols or jump to…').fill('AAPL');
  await expect(page.getByRole('button', { name: /NASDAQ:AAPL/ })).toBeVisible();
  await page.getByRole('button', { name: /NASDAQ:AAPL/ }).click();
  await expect(chart).toHaveAttribute('data-symbol', 'AAPL');
  await expect(chart).toHaveAttribute('data-loading', 'false');

  await page.getByRole('button', { name: /Search symbols or jump to/ }).click();
  await expect(page.getByPlaceholder('Search symbols or jump to…')).toBeVisible();
  await page.getByPlaceholder('Search symbols or jump to…').fill('BTC');
  await expect(page.getByRole('button', { name: /BINANCE:BTCUSDT/ })).toBeVisible();
  await page.getByRole('button', { name: /BINANCE:BTCUSDT/ }).click();
  await expect(chart).toHaveAttribute('data-symbol', 'BTCUSDT');
  await expect(chart).toHaveAttribute('data-loading', 'false');

  expect(historyRequests).toContainEqual({ symbol: 'BTCUSDT', interval: '1m' });
  expect(historyRequests).toContainEqual({ symbol: 'AAPL', interval: '1h' });
  expect(historyRequests).toContainEqual({ symbol: 'BTCUSDT', interval: '1h' });
});

test('drawings undo and redo with keyboard shortcuts', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  await drawTwoPointOverlay(page, 'Trend line');

  await page.keyboard.press('Control+Z');
  await waitForDrawingState(page, { overlayCount: 0, canRedo: true });

  await page.keyboard.press('Control+Shift+Z');
  await waitForDrawingState(page, { overlayCount: 1, selected: false, canUndo: true });
});

test('realtime chart updates do not cancel an in-progress drawing', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  await expect(page.locator('.kline-core').first()).toHaveAttribute('data-loading', 'false');
  await page.getByRole('button', { name: 'Trend line', exact: true }).click();
  const start = await chartPoint(page, 0.32, 0.36);
  const end = await chartPoint(page, 0.63, 0.56);

  await page.mouse.click(start.x, start.y);
  await waitForDrawingState(page, { overlayCount: 1, canUndo: true });
  await emitMockRealtimeBar(page);
  await page.mouse.click(end.x, end.y);

  await waitForDrawingState(page, { overlayCount: 1, selected: true, canUndo: true });
});

test('drawings delete with middle click on the hovered object', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  const points = await drawTwoPointOverlay(page, 'Trend line');
  await page.mouse.move(points.mid.x, points.mid.y);
  await waitForDrawingState(page, { overlayCount: 1, hovered: true });
  await page.mouse.click(points.mid.x, points.mid.y, { button: 'middle' });
  await waitForDrawingState(page, { overlayCount: 0, canUndo: true });

  await page.keyboard.press('Control+Z');
  await waitForDrawingState(page, { overlayCount: 1, canRedo: true });
});

test('selected drawings expose contextual actions beside the object', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  await drawTwoPointOverlay(page, 'Trend line');
  await expect(page.getByRole('button', { name: 'Delete drawing' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete drawing' }).click();
  await waitForDrawingState(page, { overlayCount: 0, canUndo: true });
});

test('layout page renders saved chart panels', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/layout');

  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  await expect(page.locator('.chart-panel')).toHaveCount(2);
  await expect.poll(() => page.locator('.chart-panel canvas').count()).toBeGreaterThan(0);
});

test('discovery renders news, macro, catalysts and assets', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/discovery');

  await expect(page.getByRole('heading', { name: 'Discovery' })).toBeVisible();
  await expect(page.getByText('Headlines')).toBeVisible();
  await expect(page.getByText('Apple suppliers lift guidance on AI device cycle')).toBeVisible();
  await expect(page.getByText('Macro pulse')).toBeVisible();
  await expect(page.getByText('Consumer Price Index')).toBeVisible();
  await expect(page.getByText('Catalysts')).toBeVisible();
  await expect(page.getByText('ISM Manufacturing PMI')).toBeVisible();
  await expect(page.getByText('Asset board')).toBeVisible();
  await expect(page.getByRole('link', { name: 'AAPL', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fundamentals')).toBeVisible();
});

test('workspace keeps long watchlist rows inside the dock', async ({ page }) => {
  await installAppMocks(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const watchlistDock = page.locator('.ui-dock').filter({
    has: page.getByText('Watchlist', { exact: true }),
  });

  await expect(watchlistDock).toBeVisible();
  await expect(watchlistDock.locator('.ui-row--wl')).toHaveCount(0);
});

test('workspace contains long watchlist rows when the dock overflows', async ({ page }) => {
  await installAppMocks(page, {
    watchlists: manyWatchlists,
    watchlistItems: manyWatchlistItems,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const watchlistDock = page.locator('.ui-dock').filter({
    has: page.getByText('Watchlist', { exact: true }),
  });

  await expect(watchlistDock).toBeVisible();
  await expect(watchlistDock.locator('.ui-row--wl')).toHaveCount(manyWatchlistItems.length);

  await expectContainedVerticalScroll(
    watchlistDock.locator('.ui-dock-body'),
    '.ui-row--wl:first-child .wl-row-remove',
  );

  const spillsBelow = await watchlistDock.evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(
      panelRect.left + panelRect.width / 2,
      panelRect.bottom + 4,
    );
    return hit?.closest('.ui-row--wl') != null;
  });

  expect(spillsBelow).toBe(false);
});

test('shared scroll containers keep long lists inside their content bounds', async ({ page }) => {
  await installAppMocks(page, {
    watchlists: manyWatchlists,
    watchlistItems: manyWatchlistItems,
    alerts: manyAlerts,
    searchResults: manySymbols,
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  await expectContainedVerticalScroll(page.locator('.alerts'));

  await page.getByRole('button', { name: /Search symbols or jump to/ }).click();
  await expect(page.getByPlaceholder('Search symbols or jump to…')).toBeVisible();
  await page.getByPlaceholder('Search symbols or jump to…').fill('SYM');
  await expect(page.locator('.ui-cmdk-list')).toBeVisible();
  await expect(page.locator('.ui-cmdk-item')).toHaveCount(manySymbols.length);
  await expectContainedVerticalScroll(
    page.locator('.ui-cmdk-list'),
    '.ui-cmdk-item:first-of-type .ui-cmdk-meta',
  );
});
