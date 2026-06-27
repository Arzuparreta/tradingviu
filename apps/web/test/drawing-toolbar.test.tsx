import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import type { Drawing } from '@tv/drawing-tools';
import { DrawingToolbar } from '../src/components/DrawingToolbar';

let registeredDom = false;

const drawing = (id: string, name: string, zLevel: number): Drawing => ({
  engine: 'klinecharts',
  id,
  name,
  points: [
    { timestamp: 1_700_000_000_000, value: 100 },
    { timestamp: 1_700_003_600_000, value: 110 },
  ],
  styles: {
    line: { color: '#f5c542', size: 2, style: 'solid' },
    polygon: { color: '#332817' },
    text: { color: '#f5c542' },
  },
  mode: 'normal',
  lock: false,
  visible: true,
  zLevel,
  createdAt: 1,
  updatedAt: 1,
});

const baseProps = {
  manager: null,
  activeTool: null,
  isPlacing: false,
  canUndo: false,
  canRedo: false,
  onStartTool: mock(() => {}),
  onCancelPlacement: mock(() => {}),
  onSelectDrawing: mock((_id: string | null) => {}),
  onRemoveSelected: mock(() => {}),
  onClearAll: mock(() => {}),
  onToggleLock: mock((_id: string) => {}),
  onToggleVisibility: mock((_id: string) => {}),
  onRenameDrawing: mock((_id: string, _label: string) => {}),
  onUpdateStyle: mock((_id: string, _patch: object) => {}),
  onDuplicateDrawing: mock((_id: string) => {}),
  onCopyDrawing: mock((_id: string) => {}),
  onPasteDrawing: mock(() => {}),
  onMoveDrawing: mock((_id: string, _direction: string) => {}),
  onSetDrawingGroup: mock((_id: string, _groupId: string | null) => {}),
  onUndo: mock(() => {}),
  onRedo: mock(() => {}),
};

const renderToolbar = (selectedId: string | null = 'd1', activeTool: string | null = null) => render(
  createElement(DrawingToolbar, {
    ...baseProps,
    activeTool,
    drawings: [drawing('d1', 'segment', 0), drawing('d2', 'rect', 1)],
    selectedId,
  }),
);

beforeAll(() => {
  if (!globalThis.document) {
    GlobalRegistrator.register();
    registeredDom = true;
  }
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const value of Object.values(baseProps)) {
    if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
  }
});

afterAll(() => {
  if (registeredDom) GlobalRegistrator.unregister();
});

describe('DrawingToolbar object management', () => {
  test('opens the object tree and routes selection, rename, and group edits', () => {
    const view = renderToolbar('d1');

    fireEvent.click(view.getByLabelText('Objects'));
    fireEvent.click(view.getByTitle('Rectangle'));
    expect(baseProps.onSelectDrawing).toHaveBeenCalledWith('d2');

    fireEvent.blur(view.getByLabelText('Object name'), { target: { value: 'Breakout guide' } });
    expect(baseProps.onRenameDrawing).toHaveBeenCalledWith('d1', 'Breakout guide');

    fireEvent.blur(view.getByLabelText('Group'), { target: { value: 'setup-a' } });
    expect(baseProps.onSetDrawingGroup).toHaveBeenCalledWith('d1', 'setup-a');
  });

  test('keeps keyboard shortcuts wired to selected object actions', () => {
    renderToolbar('d1');

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(baseProps.onCopyDrawing).toHaveBeenCalledWith('d1');
    expect(baseProps.onPasteDrawing).toHaveBeenCalled();
    expect(baseProps.onDuplicateDrawing).toHaveBeenCalledWith('d1');
    expect(baseProps.onToggleLock).toHaveBeenCalledWith('d1');
    expect(baseProps.onRemoveSelected).toHaveBeenCalled();
  });

  test('persists favorite tools and style templates locally', () => {
    const view = renderToolbar('d1', 'rect');

    fireEvent.click(view.getByLabelText('Favorite tool'));
    expect(JSON.parse(localStorage.getItem('tv.drawing.favoriteTools') ?? '[]')).toEqual(['rect']);

    fireEvent.click(view.getByLabelText('Objects'));
    fireEvent.click(view.getByLabelText('Save style'));
    const templates = JSON.parse(localStorage.getItem('tv.drawing.styleTemplates') ?? '[]') as unknown[];
    expect(templates).toHaveLength(1);
  });
});
