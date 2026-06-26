/**
 * Regression test for the "chart blank on client-side navigation" bug.
 *
 * The bug:
 *   1. ChartPage mounted with `user=null` (auth bootstrap in flight) →
 *      early-return path taken → containerRef.current is null → chart
 *      creation useEffect's first run does nothing.
 *   2. user becomes set → component re-renders past the early-return →
 *      containerRef attaches to the new <div> → BUT the chart creation
 *      useEffect had `[]` deps so it never re-ran → chart never created
 *      → permanent black canvas.
 *
 * The fix was to make the chart creation useEffect's deps `[user,
 * symbolId]` so it re-runs when user loads.
 *
 * This test guards against the regression by asserting that the canvas
 * does NOT exist while user is null, but DOES exist (with non-zero
 * dimensions) after user loads.
 */
import { describe, test, expect, beforeAll, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mutable auth state controlled by the test.
let authUser: { id: string; email: string } | null = null;
const mockAuthState = {
  get user() {
    return authUser;
  },
  set user(v: typeof authUser) {
    authUser = v;
  },
  tenant: null,
  loading: false,
  bootstrap: () => Promise.resolve(),
  login: () => Promise.resolve(),
  signup: () => Promise.resolve(),
  logout: () => Promise.resolve(),
};

mock.module('../src/stores/auth', () => ({
  useAuth: Object.assign(
    () => mockAuthState,
    {
      getState: () => mockAuthState,
      setState: (partial: Partial<typeof mockAuthState>) => Object.assign(mockAuthState, partial),
    },
  ),
}));

// Stub the bar stream so we don't open a real WebSocket.
mock.module('../src/hooks/use-bar-stream', () => ({
  useBarStream: () => ({
    status: 'idle',
    message: null,
    lastUpdateAt: null,
  }),
}));

// Stub the chart history hook — we only care that the canvas is created.
mock.module('../src/hooks/use-chart-history', () => ({
  useChartHistory: () => ({
    bars: [],
    symbol: null,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: true,
    loadMore: () => Promise.resolve(),
    upsertBar: () => {},
    appendBar: () => {},
    reset: () => {},
  }),
}));

// Lightweight stub for @tv/chart-engine so we don't need lightweight-charts
// in a happy-dom environment. The stub creates a real <canvas> element
// and tags it so the test can assert on it.
const fakeSeries = () => ({
  setData: () => {},
  update: () => {},
  applyOptions: () => {},
  priceScale: () => ({ applyOptions: () => {} }),
});

const fakeChart = (container: HTMLElement) => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  canvas.setAttribute('data-tv-test-canvas', '1');
  container.appendChild(canvas);
  return {
    applyOptions: () => {},
    timeScale: () => ({
      fitContent: () => {},
      subscribeVisibleTimeRangeChange: () => () => {},
      unsubscribeVisibleTimeRangeChange: () => {},
      subscribeVisibleLogicalRangeChange: () => () => {},
      unsubscribeVisibleLogicalRangeChange: () => {},
    }),
    addSeries: () => fakeSeries(),
    removeSeries: () => {},
    remove: () => {
      canvas.remove();
    },
  } as unknown as Parameters<typeof import('@tv/chart-engine').createTvChart>[0] extends infer O
    ? O extends { container: infer C }
      ? C extends HTMLElement
        ? ReturnType<typeof import('@tv/chart-engine').createTvChart>
        : never
      : never
    : never;
};

mock.module('@tv/chart-engine', () => ({
  createTvChart: (opts: { container: HTMLElement }) => fakeChart(opts.container),
  addSeries: () => fakeSeries(),
  setData: () => {},
  update: () => {},
  createMarkers: () => ({ setMarkers: () => {} }),
  removeChart: (chart: { remove: () => void }) => chart.remove(),
  darkTheme: {},
  subscribeVisibleTimeRange: () => () => {},
}));

// Static imports — must be AFTER all mock.module calls.
import { ChartPage } from '../src/pages/ChartPage';

beforeAll(() => {
  GlobalRegistrator.register();
});

afterEach(() => {
  cleanup();
  authUser = null;
});

const wrap = (children: ReactNode, qc: QueryClient) =>
  createElement(
    MemoryRouter,
    { initialEntries: ['/chart/01KVV99Y5SHDWR8HZ5SE065TBX'] },
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/chart/:symbol',
          element: children,
        }),
      ),
    ),
  );

describe('ChartPage regression: chart canvas appears after auth loads', () => {
  test('blank when user=null, canvas appears when user=set', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;

    try {
      // Phase 1: user=null. ChartPage should take the early-return path.
      authUser = null;
      root = createRoot(container);
      root.render(wrap(createElement(ChartPage), qc));

      await waitFor(() => {
        expect(container.textContent ?? '').toMatch(/log in/i);
      });
      // No canvas should be in the DOM while user is null.
      expect(container.querySelector('[data-tv-test-canvas]')).toBeNull();

      // Phase 2: user becomes set. The chart creation useEffect must
      // re-run (deps include user) and create the chart.
      authUser = { id: 'u1', email: 'test@x.com' };
      root.render(wrap(createElement(ChartPage), qc));

      await waitFor(
        () => {
          const canvas = container.querySelector('[data-tv-test-canvas]');
          expect(canvas).not.toBeNull();
        },
        { timeout: 2000 },
      );
      const canvas = container.querySelector<HTMLCanvasElement>(
        '[data-tv-test-canvas]',
      )!;
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    } finally {
      root?.unmount();
      document.body.removeChild(container);
    }
  });
});
