import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChartSurfaceHandle, Drawing } from '@tv/drawing-tools';

const instances: FakeDrawingManager[] = [];

class FakeDrawingManager {
  private drawings: Drawing[] = [];
  private callbacks: Array<(drawings: Drawing[]) => void> = [];

  constructor() {
    instances.push(this);
  }

  attach(): void {}
  detach(): void {}

  importDrawings(drawings: readonly Drawing[]): void {
    this.drawings = [...drawings];
  }

  exportDrawings(): Drawing[] {
    return [...this.drawings];
  }

  startTool(): void {}
  cancelPlacement(): void {}
  select(): void {}
  remove(): void {}
  clear(): void {}
  setLocked(): void {}
  setVisible(): void {}
  isPlacing(): boolean { return false; }
  getSelectedId(): string | null { return null; }
  getActiveTool(): string | null { return null; }

  onChange(callback: (drawings: Drawing[]) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  emit(drawings: readonly Drawing[]): void {
    this.drawings = [...drawings];
    for (const callback of this.callbacks) {
      callback(this.exportDrawings());
    }
  }

  ids(): string[] {
    return this.drawings.map((drawing) => drawing.id);
  }
}

mock.module('@tv/drawing-tools', () => ({
  LwcDrawingManager: FakeDrawingManager,
  ourToolToLibraryType: (name: string) => name,
}));

const drawingsMock = mock(
  (_symbolId: string, _interval: string, scope?: string) =>
    Promise.resolve({ drawings: [drawing(`${scope ?? 'symbol'}-server`, 100)] }),
);
const saveDrawingsMock = mock(
  (_symbolId: string, _interval: string, _drawings: Drawing[], _scope?: string) =>
    Promise.resolve({ ok: true }),
);

mock.module('../src/api/client', () => ({
  api: {
    drawings: drawingsMock,
    saveDrawings: saveDrawingsMock,
  },
}));

import { useDrawingManager } from '../src/hooks/use-drawing-manager';

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

function Harness() {
  const leftSurface = useRef<ChartSurfaceHandle | null>({} as ChartSurfaceHandle);
  const rightSurface = useRef<ChartSurfaceHandle | null>({} as ChartSurfaceHandle);

  useDrawingManager({
    surfaceRef: leftSurface,
    symbolId: 'sym-a',
    interval: '1h',
    scopeId: 'draw_left',
    chartReady: true,
    enabled: true,
  });
  useDrawingManager({
    surfaceRef: rightSurface,
    symbolId: 'sym-a',
    interval: '1h',
    scopeId: 'draw_right',
    chartReady: true,
    enabled: true,
  });

  return createElement('output', { 'data-testid': 'mounted' }, 'ok');
}

const renderHarness = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let result: ReturnType<typeof render> | null = null;
  await act(async () => {
    result = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Harness),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return result!;
};

beforeAll(() => {
  if (!globalThis.document) {
    GlobalRegistrator.register();
    registeredDom = true;
  }
});

afterEach(() => {
  cleanup();
  instances.length = 0;
  drawingsMock.mockClear();
  saveDrawingsMock.mockClear();
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

describe('useDrawingManager multi-panel scopes', () => {
  test('loads drawings independently for each panel scope', async () => {
    await renderHarness();

    await waitFor(() => {
      expect(drawingsMock).toHaveBeenCalledTimes(2);
    });
    expect(drawingsMock.mock.calls.map((call) => call[2]).sort()).toEqual(['draw_left', 'draw_right']);

    await waitFor(() => {
      expect(instances.map((instance) => instance.ids()).flat().sort()).toEqual([
        'draw_left-server',
        'draw_right-server',
      ]);
    });
  });

  test('saves local edits back to the originating panel scope', async () => {
    await renderHarness();

    await waitFor(() => {
      expect(instances.length).toBe(2);
      expect(instances[0]?.ids()).toEqual(['draw_left-server']);
      expect(instances[1]?.ids()).toEqual(['draw_right-server']);
    });

    const local = drawing('left-local', 120);
    act(() => {
      instances[0]?.emit([local]);
    });

    await waitFor(
      () => {
        expect(saveDrawingsMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 1_500 },
    );
    expect(saveDrawingsMock.mock.calls[0]).toEqual(['sym-a', '1h', [local], 'draw_left']);
  });
});
