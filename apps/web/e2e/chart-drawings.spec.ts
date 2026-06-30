import { expect, test, type Page } from '@playwright/test';
import type { LayoutConfig } from '@tv/layout-sync';

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

const installAppMocks = async (page: Page) => {
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
      await fulfillJson({ watchlists: [] });
      return;
    }

    if (url.pathname === '/api/alerts') {
      await fulfillJson({ alerts: [] });
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

  const metrics = await assetPanel.evaluate((panel) => {
    const list = panel.querySelector('.dashboard-list');
    if (!(list instanceof HTMLElement)) return null;

    const panelRect = panel.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const hit = document.elementFromPoint(
      panelRect.left + panelRect.width / 2,
      panelRect.bottom + 4,
    );

    return {
      listBottom: listRect.bottom,
      panelBottom: panelRect.bottom,
      listOverflowY: window.getComputedStyle(list).overflowY,
      spillsBelow: hit?.closest('.dashboard-asset-row') != null,
    };
  });

  expect(metrics).not.toBeNull();
  if (metrics == null) return;
  expect(metrics.listBottom).toBeLessThanOrEqual(metrics.panelBottom);
  expect(metrics.listOverflowY).toBe('auto');
  expect(metrics.spillsBelow).toBe(false);
});
