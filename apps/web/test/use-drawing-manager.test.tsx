import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChartSurfaceHandle, Drawing } from '@tv/drawing-tools';

const instances: FakeDrawingManager[] = [];

class FakeDrawingManager {
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
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
  select(id: string | null): void { this.selectedId = id; }
  remove(): void {}
  clear(): void {}
  setLocked(): void {}
  setVisible(): void {}
  updateDrawing(): void {}
  isPlacing(): boolean { return false; }
  getSelectedId(): string | null { return this.selectedId; }
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

  snapshot(): Drawing[] {
    return this.drawings;
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

let singleResult: ReturnType<typeof useDrawingManager> | null = null;

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

function SingleHarness() {
  const surface = useRef<ChartSurfaceHandle | null>({} as ChartSurfaceHandle);
  singleResult = useDrawingManager({
    surfaceRef: surface,
    symbolId: 'sym-a',
    interval: '1h',
    scopeId: 'draw_single',
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

const renderSingleHarness = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let result: ReturnType<typeof render> | null = null;
  await act(async () => {
    result = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(SingleHarness),
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
  singleResult = null;
  drawingsMock.mockClear();
  saveDrawingsMock.mockClear();
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

describe('useDrawingManager object management', () => {
  test('renames, styles, locks, hides, groups, and saves the selected drawing', async () => {
    await renderSingleHarness();

    await waitFor(() => {
      expect(singleResult?.drawings[0]?.id).toBe('draw_single-server');
    });
    const id = singleResult!.drawings[0]!.id;

    act(() => {
      singleResult!.selectDrawing(id);
      singleResult!.renameDrawing(id, 'Breakout guide');
      singleResult!.updateStyle(id, {
        lineColor: '#00ff00',
        fillColor: '#003300',
        textColor: '#ffffff',
        lineWidth: 4,
        lineStyle: 'dashed',
      });
      singleResult!.toggleLock(id);
      singleResult!.toggleVisibility(id);
      singleResult!.setDrawingGroup(id, 'setup-a');
    });

    await waitFor(() => {
      const current = instances[0]?.snapshot()[0];
      expect((current?.extendData as Record<string, unknown> | undefined)?.label).toBe('Breakout guide');
      expect((current?.styles as Record<string, unknown> | null | undefined)?.line).toEqual({
        color: '#00ff00',
        size: 4,
        style: 'dashed',
      });
      expect(current?.lock).toBe(true);
      expect(current?.visible).toBe(false);
      expect(current?.groupId).toBe('setup-a');
    });

    await waitFor(
      () => {
        expect(saveDrawingsMock).toHaveBeenCalled();
      },
      { timeout: 1_500 },
    );
    const saved = saveDrawingsMock.mock.calls.at(-1)?.[2] as Drawing[];
    expect(saved[0]?.groupId).toBe('setup-a');
  });

  test('duplicates, copy-pastes, reorders, and supports undo/redo locally', async () => {
    await renderSingleHarness();

    await waitFor(() => {
      expect(singleResult?.drawings[0]?.id).toBe('draw_single-server');
    });
    const originalId = singleResult!.drawings[0]!.id;

    act(() => {
      singleResult!.duplicateDrawing(originalId);
    });

    await waitFor(() => {
      expect(instances[0]?.snapshot()).toHaveLength(2);
    });
    const duplicateId = instances[0]!.snapshot().find((item) => item.id !== originalId)!.id;
    expect(singleResult!.selectedId).toBe(duplicateId);

    act(() => {
      singleResult!.copyDrawing(originalId);
      singleResult!.pasteDrawing();
    });

    await waitFor(() => {
      expect(instances[0]?.snapshot()).toHaveLength(3);
    });

    act(() => {
      singleResult!.moveDrawing(originalId, 'top');
    });

    await waitFor(() => {
      const ordered = instances[0]!.snapshot().sort((a, b) => (a.zLevel ?? 0) - (b.zLevel ?? 0));
      expect(ordered.at(-1)?.id).toBe(originalId);
    });

    act(() => {
      singleResult!.undo();
    });

    await waitFor(() => {
      const ordered = instances[0]!.snapshot().sort((a, b) => (a.zLevel ?? 0) - (b.zLevel ?? 0));
      expect(ordered.at(-1)?.id).not.toBe(originalId);
    });

    act(() => {
      singleResult!.redo();
    });

    await waitFor(() => {
      const ordered = instances[0]!.snapshot().sort((a, b) => (a.zLevel ?? 0) - (b.zLevel ?? 0));
      expect(ordered.at(-1)?.id).toBe(originalId);
    });
  });
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
