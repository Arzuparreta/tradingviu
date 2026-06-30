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

const manySymbols: TvSymbol[] = Array.from({ length: 18 }, (_, index) => ({
  id: `SYM${index}`,
  exchange: 'NASDAQ',
  ticker: `SYM${index}`,
  name: `Scrollable Mock Equity ${index}`,
  assetClass: 'stock',
  currency: 'USD',
  active: true,
}));

const manyWatchlists: Watchlist[] = Array.from({ length: 18 }, (_, index) => ({
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

interface AppMockOptions {
  watchlists?: readonly Watchlist[];
  watchlistItems?: readonly WatchlistItem[];
  alerts?: readonly AlertRow[];
  searchResults?: readonly TvSymbol[];
}

const installAppMocks = async (page: Page, options: AppMockOptions = {}) => {
  const watchlists = options.watchlists ?? [];
  const watchlistItems = options.watchlistItems ?? [];
  const alerts = options.alerts ?? [];
  const searchResults = options.searchResults ?? symbols;

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
      const symbol =
        symbols.find((item) => item.id === symbolId || item.ticker === symbolId) ?? btc;
      await fulfillJson({
        symbol,
        interval: url.searchParams.get('interval') ?? '1h',
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
  expect(metrics.scrollbarWidth).toBe('auto');
  expect(metrics.gutterWidth).toBeGreaterThanOrEqual(10);
  if (metrics.rightEdgeRight != null) {
    expect(metrics.rightEdgeRight).toBeLessThanOrEqual(metrics.clientRight + 1);
  }
};

test('chart route renders KLineChart Pro', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');

  await expect(page.getByText('Bitcoin / Tether')).toBeVisible();
  await expect(page.getByText('Indicator')).toBeVisible();
  await expect(page.getByText('Screenshot')).toBeVisible();
  await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(0);
});

test('legacy chart aliases collapse to the canonical chart', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/chart-legacy/BTCUSDT');

  await expect(page).toHaveURL(/\/chart\/BTCUSDT$/);
  await expect(page.getByText('Bitcoin / Tether')).toBeVisible();
  await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(0);
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
  await expect(page.getByRole('heading', { name: 'Headlines' })).toBeVisible();
  await expect(page.getByText('Apple suppliers lift guidance on AI device cycle')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Macro pulse' })).toBeVisible();
  await expect(page.getByText('Consumer Price Index')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catalysts' })).toBeVisible();
  await expect(page.getByText('ISM Manufacturing PMI')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Asset board' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AAPL', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fundamental snapshots' })).toBeVisible();
});

test('dashboard keeps asset board rows inside the panel', async ({ page }) => {
  await installAppMocks(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const assetPanel = page.locator('.dashboard-panel').filter({
    has: page.getByRole('heading', { name: 'Asset board' }),
  });

  await expect(assetPanel).toBeVisible();
  await expect(assetPanel.locator('.dashboard-asset-row')).toHaveCount(screenerResults.length);

  await expectContainedVerticalScroll(
    assetPanel.locator('.dashboard-list'),
    '.dashboard-asset-row:first-child strong span',
  );

  const spillsBelow = await assetPanel.evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(
      panelRect.left + panelRect.width / 2,
      panelRect.bottom + 4,
    );
    return hit?.closest('.dashboard-asset-row') != null;
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

  await page.goto('/watchlists');
  await expect(page.getByRole('heading', { name: 'Watchlists' })).toBeVisible();
  await expectContainedVerticalScroll(
    page.locator('.wl-lists'),
    '.wl-list-row:first-of-type .wl-del',
  );
  await expectContainedVerticalScroll(
    page.locator('.wl-grid .tbl-wrap'),
    'tbody tr:first-child td.num button',
  );

  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  await expectContainedVerticalScroll(page.locator('.al-grid .tbl-wrap'));

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await page.keyboard.type('SYM');
  await expect(page.locator('.symbol-search-results')).toBeVisible();
  await expectContainedVerticalScroll(
    page.locator('.symbol-search-results'),
    '.symbol-search-item:first-of-type > span:last-child',
  );
});
