import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Drawing } from '@tv/drawing-tools';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const drawingsMock = mock(() => Promise.resolve({ drawings: [] as Drawing[] }));
const saveDrawingsMock = mock(() => Promise.resolve({ ok: true }));

mock.module('../src/api/client', () => ({
  api: {
    drawings: drawingsMock,
    saveDrawings: saveDrawingsMock,
  },
}));

import { useDrawings } from '../src/hooks/use-drawings';

let registeredDom = false;

const drawing = (id: string, value: number): Drawing => ({
  engine: 'klinecharts',
  id,
  name: 'segment',
  points: [
    { timestamp: 1_700_000_000_000, value },
    { timestamp: 1_700_003_600_000, value: value + 1 },
  ],
  styles: null,
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 1,
});

function Harness({ onState }: { onState: (state: ReturnType<typeof useDrawings>) => void }) {
  const state = useDrawings({ symbolId: 'sym-a', interval: '1h', enabled: true });
  onState(state);
  return createElement('output', { 'data-testid': 'count' }, state.drawings.length);
}

beforeAll(() => {
  if (!globalThis.document) {
    GlobalRegistrator.register();
    registeredDom = true;
  }
});

afterEach(() => {
  cleanup();
  drawingsMock.mockReset();
  saveDrawingsMock.mockReset();
  drawingsMock.mockImplementation(() => Promise.resolve({ drawings: [] }));
  saveDrawingsMock.mockImplementation(() => Promise.resolve({ ok: true }));
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

describe('useDrawings', () => {
  test('does not overwrite local edits when the initial query resolves late', async () => {
    const firstQuery = deferred<{ drawings: Drawing[] }>();
    drawingsMock.mockImplementation(() => firstQuery.promise);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let latest: ReturnType<typeof useDrawings> | null = null;

    const view = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Harness, { onState: (state) => { latest = state; } }),
      ),
    );

    const localDrawing = drawing('local', 100);
    act(() => {
      latest?.setDrawings([localDrawing]);
    });
    expect(view.getByTestId('count').textContent).toBe('1');

    await act(async () => {
      firstQuery.resolve({ drawings: [drawing('server-stale', 200)] });
      await firstQuery.promise;
    });

    await waitFor(() => {
      expect(latest?.drawings.map((d) => d.id)).toEqual(['local']);
    });
    await waitFor(() => {
      expect(saveDrawingsMock).toHaveBeenCalledTimes(1);
    });
    expect(saveDrawingsMock.mock.calls[0]?.[2]).toEqual([localDrawing]);
  });
});
