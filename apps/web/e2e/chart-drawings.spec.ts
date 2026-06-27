import { expect, test, type Page } from '@playwright/test';

interface DrawingPoint {
  readonly timestamp?: number;
  readonly value?: number;
}

interface Drawing {
  readonly engine: 'klinecharts';
  readonly id: string;
  readonly name: string;
  readonly groupId?: string;
  readonly points: readonly DrawingPoint[];
  readonly styles?: Record<string, unknown> | null;
  readonly mode: 'normal';
  readonly lock: boolean;
  readonly visible: boolean;
  readonly zLevel: number;
  readonly extendData?: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

declare global {
  interface Window {
    __TV_E2E_CHARTS__?: Record<
      string,
      {
        getLogicalRange(): { from: number; to: number } | null;
        fitContent(): void;
      }
    >;
  }
}

const symbol = {
  id: 'BTCUSDT',
  exchange: 'BINANCE',
  ticker: 'BTCUSDT',
  name: 'Bitcoin / Tether',
  assetClass: 'crypto',
  currency: 'USDT',
};

const seededDrawing = (): Drawing => ({
  engine: 'klinecharts',
  id: 'draw_seed_trend',
  name: 'segment',
  points: [
    { timestamp: 1_735_689_600_000, value: 101 },
    { timestamp: 1_735_696_800_000, value: 108 },
  ],
  styles: {
    line: { color: '#f5c542', size: 2, style: 'solid' },
    polygon: { color: '#332817', borderColor: '#f5c542', borderSize: 2 },
    text: { color: '#f5c542' },
  },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  extendData: { label: 'Seed trend' },
  createdAt: 1_735_689_600_000,
  updatedAt: 1_735_689_600_000,
});

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

const installAppMocks = async (page: Page, initialDrawings: readonly Drawing[] = []) => {
  let drawings = [...initialDrawings];
  const saves: Drawing[][] = [];

  await page.addInitScript(() => {
    localStorage.setItem('tv_token', 'e2e-token');

    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send(raw: string) {
        try {
          const message = JSON.parse(raw) as { type?: string };
          if (message.type === 'subscribe_market') {
            window.setTimeout(() => {
              const event = new MessageEvent('message', {
                data: JSON.stringify({ type: 'market_status', status: 'live' }),
              });
              this.dispatchEvent(event);
              this.onmessage?.(event);
            }, 0);
          }
        } catch {
          void 0;
        }
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
      await fulfillJson({
        user: {
          id: 'usr_e2e',
          email: 'e2e@example.com',
          displayName: 'E2E User',
          globalRole: 'user',
          createdAt: '2026-06-27T00:00:00.000Z',
        },
        tenant: {
          id: 'ten_e2e',
          name: 'E2E Tenant',
          slug: 'e2e',
          planCode: 'free',
          createdAt: '2026-06-27T00:00:00.000Z',
        },
      });
      return;
    }

    if (url.pathname === '/api/symbols' || url.pathname === '/api/symbols/search') {
      await fulfillJson({ results: [symbol] });
      return;
    }

    if (url.pathname === '/api/chart/history') {
      await fulfillJson({
        symbol,
        interval: url.searchParams.get('interval') ?? '1h',
        bars,
        fresh: true,
      });
      return;
    }

    if (url.pathname === '/api/chart/dom') {
      await fulfillJson({
        symbol,
        source: 'e2e',
        book: {
          mid: 108,
          spread: 0.5,
          tickSize: 0.5,
          bids: [{ price: 107.75, size: 2, cumulative: 2 }],
          asks: [{ price: 108.25, size: 2, cumulative: 2 }],
          imbalance: 0,
          generatedAt: '2026-06-27T00:00:00.000Z',
        },
      });
      return;
    }

    if (url.pathname === '/api/drawings') {
      if (request.method() === 'PUT') {
        const payload = (await request.postDataJSON()) as { drawings?: Drawing[] };
        drawings = payload.drawings ?? [];
        saves.push(drawings);
      }
      await fulfillJson({ drawings });
      return;
    }

    if (url.pathname === '/api/indicators') {
      await fulfillJson({ indicators: [] });
      return;
    }

    if (url.pathname === '/api/backtest/strategies') {
      await fulfillJson({ strategies: [] });
      return;
    }

    if (url.pathname === '/api/paper/accounts') {
      await fulfillJson({ accounts: [] });
      return;
    }

    if (url.pathname === '/api/brokers/connections') {
      await fulfillJson({ connections: [] });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await fulfillJson({});
      return;
    }

    await route.continue();
  });

  return {
    saves,
    drawings: () => drawings,
  };
};

const firstChartRange = async (page: Page): Promise<{ from: number; to: number }> => {
  await page.waitForFunction(() => {
    const chart = Object.values(window.__TV_E2E_CHARTS__ ?? {})[0];
    const range = chart?.getLogicalRange();
    return range && Number.isFinite(range.from) && Number.isFinite(range.to);
  });
  const range = await page.evaluate(() => {
    const chart = Object.values(window.__TV_E2E_CHARTS__ ?? {})[0];
    return chart?.getLogicalRange() ?? null;
  });
  expect(range).not.toBeNull();
  return range!;
};

test('cursor mode keeps native chart pan and zoom while drawings are mounted', async ({ page }) => {
  await installAppMocks(page, [seededDrawing()]);
  await page.goto('/chart/BTCUSDT');

  await expect(page.getByTestId('chart-surface')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Objects' })).toBeVisible();

  const surface = page.getByTestId('chart-surface');
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.55;
  const y = box!.y + box!.height * 0.55;

  const beforePan = await firstChartRange(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 180, y, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await firstChartRange(page);
      return Math.abs(after.from - beforePan.from) + Math.abs(after.to - beforePan.to);
    })
    .toBeGreaterThan(1);

  const beforeZoom = await firstChartRange(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -500);

  await expect
    .poll(async () => {
      const after = await firstChartRange(page);
      return Math.abs(after.to - after.from - (beforeZoom.to - beforeZoom.from));
    })
    .toBeGreaterThan(1);
});

test('object tree edits persist through reload and deletion', async ({ page }) => {
  const mockState = await installAppMocks(page, [seededDrawing()]);
  await page.goto('/chart/BTCUSDT');

  await page.getByRole('button', { name: 'Objects' }).click();
  await expect(page.getByRole('button', { name: /Seed trend/ })).toBeVisible();
  await page.getByRole('button', { name: /Seed trend/ }).click();

  const nameInput = page.getByLabel('Object name');
  await nameInput.fill('Renamed line');
  await nameInput.blur();

  const groupInput = page.getByLabel('Group');
  await groupInput.fill('Breakout setup');
  await groupInput.blur();

  await page.getByLabel('Line width').fill('5');
  const inspector = page.locator('.lwc-drawing-inspector');
  await inspector.getByRole('button', { name: 'Lock' }).click();
  await inspector.getByRole('button', { name: 'Hide / show' }).click();

  await expect.poll(() => mockState.saves.length).toBeGreaterThan(0);
  await expect.poll(() => mockState.drawings()[0]?.extendData?.label).toBe('Renamed line');
  await expect.poll(() => mockState.drawings()[0]?.groupId).toBe('Breakout setup');
  await expect.poll(() => mockState.drawings()[0]?.lock).toBe(true);
  await expect.poll(() => mockState.drawings()[0]?.visible).toBe(false);

  await page.reload();
  await page.getByRole('button', { name: 'Objects' }).click();
  await expect(page.getByRole('button', { name: /Renamed line/ })).toBeVisible();

  await page.getByRole('button', { name: /Renamed line/ }).click();
  await page.keyboard.press('Delete');

  await expect.poll(() => mockState.drawings().length).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: 'Objects' }).click();
  await expect(page.getByText('No drawings')).toBeVisible();
});
