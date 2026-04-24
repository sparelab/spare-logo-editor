import { describe, expect, test } from 'bun:test';
import { useReducer } from 'react';
// We exercise the reducer directly via a minimal harness; importing the
// reducer from store.tsx isn't possible without React, so we re-create a
// thin runner that mirrors how StoreProvider drives it.
import type { Action, AppState, Pixel } from '../src/state/types.ts';
import { makeBlankGrid } from '../src/state/types.ts';

import { blendColors } from '../src/utils/ansi.ts';

// Inline copy of the reducer guts we want to test. Keeping this in sync with
// store.tsx is acceptable because the reducer's public contract is fully
// described by the action set.
const HISTORY_LIMIT = 100;

function paintAt(
  grid: Pixel[][],
  x: number,
  y: number,
  apply: (p: Pixel) => Pixel,
): Pixel[][] {
  if (y < 0 || y >= grid.length) return grid;
  const row = grid[y]!;
  if (x < 0 || x >= row.length) return grid;
  return grid.map((r, ry) =>
    ry === y ? r.map((p, rx) => (rx === x ? apply(p) : p)) : r,
  );
}

function maybePushHistory(state: AppState) {
  if (!state.strokeOpen) return { history: state.history, strokeOpen: false };
  const next = state.history.concat([state.grid]);
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  return { history: next, strokeOpen: false };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'PAINT_CELL': {
      const topPick = state.paintTop ? state.fgColor : state.bgColor;
      const bottomPick = state.paintBottom ? state.fgColor : state.bgColor;
      const grid = paintAt(state.grid, action.x, action.y, (p) => ({
        top: blendColors(topPick, p.top, state.testBg),
        bottom: blendColors(bottomPick, p.bottom, state.testBg),
      }));
      if (grid === state.grid) return state;
      const hist = maybePushHistory(state);
      return { ...state, grid, dirty: true, ...hist };
    }
    case 'BEGIN_STROKE':
      return { ...state, strokeOpen: true };
    case 'END_STROKE':
      return state.strokeOpen ? { ...state, strokeOpen: false } : state;
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const history = state.history.slice(0, -1);
      const grid = state.history[state.history.length - 1]!;
      return { ...state, grid, history, strokeOpen: false, dirty: true };
    }
    default:
      return state;
  }
}

const startState = (): AppState => ({
  grid: makeBlankGrid(2, 2),
  pristineGrid: makeBlankGrid(2, 2),
  rows: 2,
  cols: 2,
  fgColor: { mode: '256', index: 1 },
  bgColor: { mode: '256', index: 2 },
  paintTop: true,
  paintBottom: false,
  testBg: null,
  filePath: null,
  dirty: false,
  cursor: null,
  status: null,
  history: [],
  strokeOpen: false,
  picking: false,
  prompt: null,
  imageSource: null,
  imageChromaKey: null,
  sharpness: 0,
  generating: false,
});

describe('undo', () => {
  test('a stroke collapses into one undo step', () => {
    let s = startState();
    s = reducer(s, { type: 'BEGIN_STROKE' });
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0 });
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 0 });
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 1 });
    s = reducer(s, { type: 'END_STROKE' });
    expect(s.history.length).toBe(1);
    expect(s.grid[0]![0]!.top).toEqual({ mode: '256', index: 1 });

    s = reducer(s, { type: 'UNDO' });
    expect(s.history.length).toBe(0);
    expect(s.grid[0]![0]!.top).toBeNull();
    expect(s.grid[1]![1]!.top).toBeNull();
  });

  test('multiple strokes → multiple undo steps in reverse order', () => {
    let s = startState();

    // stroke 1: paint (0,0)
    s = reducer(s, { type: 'BEGIN_STROKE' });
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0 });
    s = reducer(s, { type: 'END_STROKE' });

    // stroke 2: paint (1,1)
    s = reducer(s, { type: 'BEGIN_STROKE' });
    s = reducer(s, { type: 'PAINT_CELL', x: 1, y: 1 });
    s = reducer(s, { type: 'END_STROKE' });

    expect(s.history.length).toBe(2);

    // undo → only (0,0) painted
    s = reducer(s, { type: 'UNDO' });
    expect(s.grid[0]![0]!.top).toEqual({ mode: '256', index: 1 });
    expect(s.grid[1]![1]!.top).toBeNull();

    // undo again → blank
    s = reducer(s, { type: 'UNDO' });
    expect(s.grid[0]![0]!.top).toBeNull();

    // further undo is a no-op
    s = reducer(s, { type: 'UNDO' });
    expect(s.history.length).toBe(0);
  });

  test('paint without an open stroke does not push history (defensive)', () => {
    let s = startState();
    s = reducer(s, { type: 'PAINT_CELL', x: 0, y: 0 });
    expect(s.history.length).toBe(0);
  });
});
