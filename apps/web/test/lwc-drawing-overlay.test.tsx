import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement, useState } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Drawing } from '@tv/drawing-tools';
import { LwcDrawingOverlay, rayEdgeEndpoint } from '../src/components/LwcDrawingOverlay';

let registeredDom = false;

const drawing = (id = 'd1'): Drawing => ({
  engine: 'klinecharts',
  id,
  name: 'segment',
  points: [
    { timestamp: 1_000, value: 10 },
    { timestamp: 2_000, value: 20 },
  ],
  styles: { line: { color: '#f5c542', size: 2 } },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 1,
});

const horizontalDrawing = (id = 'd1'): Drawing => ({
  ...drawing(id),
  name: 'horizontalStraightLine',
  points: [{ value: 10 }],
});

const fakeChart = (): IChartApi => ({
  timeScale: () => ({
    timeToCoordinate: (time: number) => time / 10,
    coordinateToTime: (x: number) => x * 10,
    subscribeVisibleTimeRangeChange: () => {},
    unsubscribeVisibleTimeRangeChange: () => {},
  }),
} as unknown as IChartApi);

const fakeSeries = (): ISeriesApi<SeriesType> => ({
  priceToCoordinate: (price: number) => price * 10,
  coordinateToPrice: (y: number) => y / 10,
} as unknown as ISeriesApi<SeriesType>);

function OverlayHarness({ onDrawings }: { onDrawings?: (drawings: Drawing[]) => void }) {
  const [drawings, setDrawings] = useState<Drawing[]>([horizontalDrawing()]);
  return createElement(
    'div',
    {
      'data-testid': 'host',
      style: { position: 'relative', width: '500px', height: '300px', cursor: 'pointer' },
    },
    createElement(LwcDrawingOverlay, {
      chart: fakeChart(),
      candleSeries: fakeSeries(),
      drawings,
      visibleBars: [],
      active: true,
      onDrawingsChange: (next) => {
        setDrawings(next);
        onDrawings?.(next);
      },
    }),
  );
}

beforeAll(() => {
  if (!globalThis.document) {
    GlobalRegistrator.register();
    registeredDom = true;
  }
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

describe('rayEdgeEndpoint', () => {
  test('chooses the boundary in the ray direction', () => {
    expect(rayEdgeEndpoint({ x: 50, y: 50 }, { x: 25, y: 25 }, 100, 100)).toEqual({ x: 0, y: 0 });
    expect(rayEdgeEndpoint({ x: 50, y: 50 }, { x: 75, y: 75 }, 100, 100)).toEqual({ x: 100, y: 100 });
    expect(rayEdgeEndpoint({ x: 50, y: 50 }, { x: 25, y: 75 }, 100, 100)).toEqual({ x: 0, y: 100 });
  });
});

describe('LwcDrawingOverlay', () => {
  test('inactive mode does not hide the chart cursor', async () => {
    const view = render(
      createElement(
        'div',
        {
          'data-testid': 'host',
          style: { position: 'relative', width: '500px', height: '300px', cursor: 'pointer' },
        },
        createElement(LwcDrawingOverlay, {
          chart: fakeChart(),
          candleSeries: fakeSeries(),
          drawings: [],
          visibleBars: [],
          active: false,
          onDrawingsChange: () => {},
        }),
      ),
    );

    await waitFor(() => {
      expect(view.getByTestId('host').style.cursor).toBe('pointer');
    });
  });

  test('cursor mode does not capture empty chart drags', () => {
    const view = render(createElement(OverlayHarness));
    const layer = view.getByTestId('lwc-drawing-interaction-layer');

    expect(layer.style.pointerEvents).toBe('none');
    expect(view.queryByTitle('Exit drawing mode (Esc)')).toBeNull();
  });

  test('drawing tools capture the chart surface while creating', () => {
    const view = render(createElement(OverlayHarness));
    const layer = view.getByTestId('lwc-drawing-interaction-layer');

    fireEvent.click(view.getByLabelText('Trend line'));

    expect(layer.style.pointerEvents).toBe('auto');
  });

  test('moving a drawing creates one undoable history entry', async () => {
    const onDrawings = mock(() => {});
    const view = render(createElement(OverlayHarness, { onDrawings }));
    const svgs = Array.from(view.container.querySelectorAll('svg'));
    const svg = svgs.at(-1)!;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 300, right: 500, bottom: 300 }),
    });
    const interactionLayer = svg.parentElement!;

    act(() => {
      fireEvent.mouseDown(interactionLayer, { clientX: 100, clientY: 100 });
    });
    act(() => {
      fireEvent.mouseMove(interactionLayer, { clientX: 120, clientY: 130 });
    });
    act(() => {
      fireEvent.mouseUp(interactionLayer);
    });

    await waitFor(() => {
      expect(onDrawings).toHaveBeenCalled();
    });
    expect(view.getByTitle('Undo (Ctrl+Z)').hasAttribute('disabled')).toBe(false);

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });

    await waitFor(() => {
      const lastCall = onDrawings.mock.calls.at(-1)?.[0] as Drawing[] | undefined;
      expect(lastCall?.[0]?.points).toEqual(horizontalDrawing().points);
    });
  });
});
