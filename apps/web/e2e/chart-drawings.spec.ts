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

interface LayoutConfig {
  readonly grid: '1' | '2' | '4' | '8' | '16';
  readonly panels: readonly {
    readonly id: string;
    readonly drawingScopeId: string;
    readonly symbolId: string | null;
    readonly interval: string;
    readonly indicators: readonly string[];
  }[];
  readonly sync: {
    readonly symbol: boolean;
    readonly interval: boolean;
    readonly crosshair: boolean;
  };
  readonly activePanel: number;
}

interface LayoutRow {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly config: LayoutConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface MockOptions {
  readonly initialDrawings?: readonly Drawing[];
  readonly scopedDrawings?: Readonly<Record<string, readonly Drawing[]>>;
  readonly layouts?: readonly LayoutRow[];
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

const layoutConfig = (): LayoutConfig => ({
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
      symbolId: 'BTCUSDT',
      interval: '1h',
      indicators: [],
    },
  ],
  sync: { symbol: false, interval: false, crosshair: true },
  activePanel: 0,
});

const layoutRow = (): LayoutRow => ({
  id: 'lay_e2e',
  name: 'Two panel E2E',
  isDefault: true,
  config: layoutConfig(),
  createdAt: '2026-06-27T00:00:00.000Z',
  updatedAt: '2026-06-27T00:00:00.000Z',
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

const installAppMocks = async (page: Page, options: readonly Drawing[] | MockOptions = []) => {
  const mockOptions: MockOptions = Array.isArray(options) ? { initialDrawings: options } : options;
  const fallbackScope = 'symbol:BTCUSDT:1h';
  const drawingsByScope = new Map<string, Drawing[]>();
  drawingsByScope.set(fallbackScope, [...(mockOptions.initialDrawings ?? [])]);
  for (const [scope, drawings] of Object.entries(mockOptions.scopedDrawings ?? {})) {
    drawingsByScope.set(scope, [...drawings]);
  }
  let layouts = [...(mockOptions.layouts ?? [])];
  const saves: Array<{ scope: string; drawings: Drawing[] }> = [];
  const scopeForUrl = (url: URL) => url.searchParams.get('scope') ?? fallbackScope;

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

    if (url.pathname === '/api/layouts') {
      if (request.method() === 'POST') {
        const payload = (await request.postDataJSON()) as {
          name?: string;
          config?: LayoutConfig;
          isDefault?: boolean;
        };
        const row: LayoutRow = {
          id: `lay_${layouts.length + 1}`,
          name: payload.name ?? 'Layout',
          isDefault: payload.isDefault ?? false,
          config: payload.config ?? layoutConfig(),
          createdAt: '2026-06-27T00:00:00.000Z',
          updatedAt: '2026-06-27T00:00:00.000Z',
        };
        layouts = [...layouts, row];
        await fulfillJson({ id: row.id });
        return;
      }
      await fulfillJson({ layouts });
      return;
    }

    if (url.pathname.startsWith('/api/layouts/')) {
      const id = url.pathname.split('/').at(-1) ?? '';
      if (request.method() === 'PUT') {
        const payload = (await request.postDataJSON()) as {
          name?: string;
          config?: LayoutConfig;
          isDefault?: boolean;
        };
        layouts = layouts.map((row) =>
          row.id === id
            ? {
                ...row,
                name: payload.name ?? row.name,
                config: payload.config ?? row.config,
                isDefault: payload.isDefault ?? row.isDefault,
                updatedAt: '2026-06-27T00:00:01.000Z',
              }
            : row,
        );
        await fulfillJson({ ok: true });
        return;
      }
      if (request.method() === 'DELETE') {
        layouts = layouts.filter((row) => row.id !== id);
        await fulfillJson({ ok: true });
        return;
      }
      await fulfillJson({ layout: layouts.find((item) => item.id === id) ?? null });
      return;
    }

    if (url.pathname === '/api/drawings') {
      const scope = scopeForUrl(url);
      if (request.method() === 'PUT') {
        const payload = (await request.postDataJSON()) as { drawings?: Drawing[] };
        drawingsByScope.set(scope, payload.drawings ?? []);
        saves.push({ scope, drawings: drawingsByScope.get(scope) ?? [] });
      }
      await fulfillJson({ drawings: drawingsByScope.get(scope) ?? [] });
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
    drawings: (scope = fallbackScope) => drawingsByScope.get(scope) ?? [],
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

const drawTool = async (
  page: Page,
  toolLabel: string,
  points: readonly { readonly x: number; readonly y: number }[],
  root = page.locator('body'),
) => {
  const directButton = root.getByRole('button', { name: toolLabel, exact: true });
  if (await directButton.isVisible().catch(() => false)) {
    await directButton.click();
  } else {
    const groups = ['Lines', 'Channels', 'Fibonacci', 'Pitchfork / Gann', 'Measure', 'Shapes', 'Annotations'];
    let clicked = false;
    for (const group of groups) {
      await root.getByRole('button', { name: group, exact: true }).click();
      const toolButton = root.getByRole('button', { name: toolLabel, exact: true });
      if (await toolButton.isVisible().catch(() => false)) {
        await toolButton.click();
        clicked = true;
        break;
      }
    }
    expect(clicked, `drawing tool ${toolLabel} is available in the dock`).toBe(true);
  }
  const surface = root.getByTestId('chart-surface');
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  for (const point of points) {
    await page.mouse.click(box!.x + box!.width * point.x, box!.y + box!.height * point.y);
  }
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

test('creates representative drawing categories and reloads them', async ({ page }) => {
  const mockState = await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');
  await expect(page.getByTestId('chart-surface')).toBeVisible();

  const scenarios = [
    {
      label: 'Trend line',
      name: 'segment',
      points: [
        { x: 0.25, y: 0.65 },
        { x: 0.48, y: 0.42 },
      ],
    },
    {
      label: 'Parallel channel',
      name: 'priceChannelLine',
      points: [
        { x: 0.22, y: 0.5 },
        { x: 0.48, y: 0.38 },
        { x: 0.5, y: 0.58 },
      ],
    },
    {
      label: 'Fib retracement',
      name: 'fibonacciLine',
      points: [
        { x: 0.28, y: 0.35 },
        { x: 0.54, y: 0.68 },
      ],
    },
    {
      label: 'Price range',
      name: 'priceRange',
      points: [
        { x: 0.34, y: 0.32 },
        { x: 0.58, y: 0.7 },
      ],
    },
    {
      label: 'Rectangle',
      name: 'rect',
      points: [
        { x: 0.4, y: 0.3 },
        { x: 0.66, y: 0.62 },
      ],
    },
    {
      label: 'Callout',
      name: 'callout',
      points: [
        { x: 0.6, y: 0.42 },
        { x: 0.72, y: 0.5 },
      ],
    },
  ] as const;

  for (const scenario of scenarios) {
    await drawTool(page, scenario.label, scenario.points);
    await expect
      .poll(() => mockState.drawings().length)
      .toBeGreaterThanOrEqual(scenarios.indexOf(scenario) + 1);
    await expect.poll(() => mockState.drawings().at(-1)?.name).toBe(scenario.name);
    await expect
      .poll(() => page.getByRole('button', { name: 'Cursor' }).getAttribute('class'))
      .toContain('primary');
  }

  await page.reload();
  await page.getByRole('button', { name: 'Objects' }).click();
  const objectsPanel = page.locator('.lwc-drawing-objects');
  for (const scenario of scenarios) {
    await expect(
      objectsPanel.getByRole('button', { name: scenario.label, exact: true }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect.poll(() => mockState.drawings().length).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: 'Objects' }).click();
  await expect(page.getByText('No drawings')).toBeVisible();
});

test('creates edge drawing tools and preserves them through reload', async ({ page }) => {
  const mockState = await installAppMocks(page);
  await page.goto('/chart/BTCUSDT');
  await expect(page.getByTestId('chart-surface')).toBeVisible();

  const scenarios = [
    {
      label: 'Text',
      name: 'text',
      points: [{ x: 0.26, y: 0.34 }],
    },
    {
      label: 'Note',
      name: 'note',
      points: [{ x: 0.36, y: 0.45 }],
    },
    {
      label: 'Price label',
      name: 'priceLabel',
      points: [{ x: 0.46, y: 0.56 }],
    },
    {
      label: 'Flag',
      name: 'flag',
      points: [{ x: 0.56, y: 0.38 }],
    },
    {
      label: 'Brush',
      name: 'brush',
      points: [
        { x: 0.22, y: 0.7 },
        { x: 0.4, y: 0.58 },
      ],
    },
    {
      label: 'Highlighter',
      name: 'highlighter',
      points: [
        { x: 0.46, y: 0.72 },
        { x: 0.64, y: 0.6 },
      ],
    },
    {
      label: 'Arrow marker',
      name: 'arrowMarker',
      points: [{ x: 0.66, y: 0.34 }],
    },
    {
      label: 'Arrow up',
      name: 'arrowUp',
      points: [{ x: 0.72, y: 0.48 }],
    },
    {
      label: 'Arrow down',
      name: 'arrowDown',
      points: [{ x: 0.78, y: 0.62 }],
    },
  ] as const;

  for (const [index, scenario] of scenarios.entries()) {
    await drawTool(page, scenario.label, scenario.points);
    await expect.poll(() => mockState.drawings().length).toBe(index + 1);
    await expect.poll(() => mockState.drawings().at(-1)?.name).toBe(scenario.name);
    await expect.poll(() => mockState.drawings().at(-1)?.points.length).toBe(scenario.points.length);
    await expect
      .poll(() => page.getByRole('button', { name: 'Cursor' }).getAttribute('class'))
      .toContain('primary');
  }

  await page.reload();
  await page.getByRole('button', { name: 'Objects' }).click();
  const objectsPanel = page.locator('.lwc-drawing-objects');
  for (const scenario of scenarios) {
    await expect(
      objectsPanel.getByRole('button', { name: scenario.label, exact: true }),
    ).toBeVisible();
  }
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

test('layout panels isolate drawing scopes for the same symbol', async ({ page }) => {
  const leftDrawing: Drawing = {
    ...seededDrawing(),
    id: 'draw_left_scope',
    extendData: { label: 'Left scope line' },
  };
  const mockState = await installAppMocks(page, {
    layouts: [layoutRow()],
    scopedDrawings: {
      scope_left: [leftDrawing],
      scope_right: [],
    },
  });

  await page.goto('/layout');
  const panels = page.locator('.chart-panel');
  await expect(panels).toHaveCount(2);
  const leftPanel = panels.nth(0);
  const rightPanel = panels.nth(1);

  await expect(leftPanel.getByTestId('chart-surface')).toBeVisible();
  await expect(rightPanel.getByTestId('chart-surface')).toBeVisible();

  await leftPanel.getByRole('button', { name: 'Objects' }).click();
  await expect(leftPanel.getByRole('button', { name: /Left scope line/ })).toBeVisible();

  await rightPanel.getByRole('button', { name: 'Objects' }).click();
  await expect(rightPanel.getByText('No drawings')).toBeVisible();

  await drawTool(
    page,
    'Rectangle',
    [
      { x: 0.25, y: 0.35 },
      { x: 0.56, y: 0.68 },
    ],
    rightPanel,
  );
  await expect.poll(() => mockState.drawings('scope_left').length).toBe(1);
  await expect.poll(() => mockState.drawings('scope_right').length).toBe(1);
  await expect.poll(() => mockState.drawings('scope_right')[0]?.name).toBe('rect');

  await page.reload();
  const reloadedPanels = page.locator('.chart-panel');
  await expect(reloadedPanels).toHaveCount(2);
  const reloadedLeft = reloadedPanels.nth(0);
  const reloadedRight = reloadedPanels.nth(1);
  await expect(reloadedLeft.getByTestId('chart-surface')).toBeVisible();
  await expect(reloadedRight.getByTestId('chart-surface')).toBeVisible();
  await reloadedLeft.getByRole('button', { name: 'Objects' }).click();
  const reloadedLeftObjects = reloadedLeft.locator('.lwc-drawing-objects');
  await expect(reloadedLeftObjects.getByRole('button', { name: /Left scope line/ })).toBeVisible();
  await expect(
    reloadedLeftObjects.getByRole('button', { name: 'Rectangle', exact: true }),
  ).toHaveCount(0);

  await reloadedRight.getByRole('button', { name: 'Objects' }).click();
  const reloadedRightObjects = reloadedRight.locator('.lwc-drawing-objects');
  await expect(
    reloadedRightObjects.getByRole('button', { name: 'Rectangle', exact: true }),
  ).toBeVisible();
  await expect(reloadedRightObjects.getByRole('button', { name: /Left scope line/ })).toHaveCount(
    0,
  );
});
