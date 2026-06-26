import { describe, test, expect, beforeAll, afterAll, afterEach, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, useState } from 'react';
import type { Drawing } from '@tv/drawing-tools';

interface FakeOverlayCreate {
  id?: string;
  name?: string;
  points?: unknown[];
}

interface FakeChart {
  applyNewData: () => void;
  subscribeAction: () => void;
  unsubscribeAction: () => void;
  resize: () => void;
  createOverlay: (overlay: string | FakeOverlayCreate) => string;
  removeOverlay: () => void;
}

const charts: FakeChart[] = [];
let registeredDom = false;

mock.module('klinecharts', () => ({
  ActionType: {
    OnVisibleRangeChange: 'onVisibleRangeChange',
    OnCrosshairChange: 'onCrosshairChange',
  },
  OverlayMode: {
    Normal: 'normal',
    WeakMagnet: 'weak_magnet',
    StrongMagnet: 'strong_magnet',
  },
  init: () => {
    const chart: FakeChart = {
      applyNewData: () => {},
      subscribeAction: () => {},
      unsubscribeAction: () => {},
      resize: () => {},
      createOverlay: (overlay) => (typeof overlay === 'string' ? overlay : overlay.id ?? 'generated-overlay'),
      removeOverlay: () => {},
    };
    charts.push(chart);
    return chart;
  },
  dispose: () => {},
}));

import { KLineChartSurface } from '../src/components/KLineChartSurface';

const drawing = (id: string): Drawing => ({
  engine: 'klinecharts',
  id,
  name: 'segment',
  points: [
    { timestamp: 1700000000000, value: 100 },
    { timestamp: 1700003600000, value: 110 },
  ],
  styles: { line: { color: '#f5c542', size: 2 } },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel: 0,
  createdAt: 1,
  updatedAt: 1,
});

function Harness() {
  const [left, setLeft] = useState<Drawing[]>([drawing('left')]);
  const [right, setRight] = useState<Drawing[]>([drawing('right')]);
  return createElement(
    'div',
    null,
    createElement(KLineChartSurface, {
      bars: [],
      drawings: left,
      active: true,
      onDrawingsChange: setLeft,
    }),
    createElement(KLineChartSurface, {
      bars: [],
      drawings: right,
      active: false,
      onDrawingsChange: setRight,
    }),
    createElement('output', { 'data-testid': 'left-count' }, left.length),
    createElement('output', { 'data-testid': 'right-count' }, right.length),
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

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

afterEach(() => {
  cleanup();
  charts.length = 0;
});

describe('KLineChartSurface drawing shortcuts', () => {
  test('undo restores only the active chart history', async () => {
    const view = render(createElement(Harness));
    const clearButtons = view.getAllByTitle('Clear drawings');

    fireEvent.click(clearButtons[0]!);
    expect(view.getByTestId('left-count').textContent).toBe('0');
    expect(view.getByTestId('right-count').textContent).toBe('1');

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(view.getByTestId('left-count').textContent).toBe('1');
    expect(view.getByTestId('right-count').textContent).toBe('1');
  });

  test('does not intercept editor/input shortcuts', () => {
    const view = render(createElement(Harness));
    const clearButtons = view.getAllByTitle('Clear drawings');
    fireEvent.click(clearButtons[0]!);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(view.getByTestId('left-count').textContent).toBe('0');
    input.remove();
  });
});
