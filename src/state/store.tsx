import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  type Action,
  type AppState,
  type Pixel,
  blankPixel,
  makeBlankGrid,
} from './types.js';
import { ansi256ToRgb, blendColors } from '../utils/ansi.js';
import type { Color } from './types.js';

function invertColor(c: Color): Color {
  if (!c) return c;
  if (c.mode === 'rgb') {
    const inv = { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b };
    return c.a !== undefined
      ? { mode: 'rgb', ...inv, a: c.a }
      : { mode: 'rgb', ...inv };
  }
  const rgb = ansi256ToRgb(c.index);
  return { mode: 'rgb', r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
}

const HISTORY_LIMIT = 100;

const initialState = (rows: number, cols: number): AppState => ({
  grid: makeBlankGrid(rows, cols),
  pristineGrid: makeBlankGrid(rows, cols),
  rows,
  cols,
  fgColor: { mode: 'rgb', r: 255, g: 255, b: 255 },
  bgColor: { mode: 'rgb', r: 0, g: 0, b: 0 },
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

/**
 * If a stroke is open and we're about to mutate the grid, capture the
 * pre-mutation grid as a history entry — but only on the FIRST mutation of
 * the stroke, so the entire drag collapses into one undo step.
 */
function maybePushHistory(state: AppState): {
  history: Pixel[][][];
  strokeOpen: boolean;
} {
  if (!state.strokeOpen) return { history: state.history, strokeOpen: false };
  const next = state.history.concat([state.grid]);
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  return { history: next, strokeOpen: false };
}

/** Nearest-neighbor resample. Crisp by design — no anti-alias for pixel art. */
function resampleNearest(
  src: Pixel[][],
  newRows: number,
  newCols: number,
): Pixel[][] {
  const sR = src.length;
  const sC = sR ? src[0]!.length : 0;
  if (sR === 0 || sC === 0) return makeBlankGrid(newRows, newCols);
  return Array.from({ length: newRows }, (_, y) =>
    Array.from({ length: newCols }, (_, x) => {
      const sx = Math.min(sC - 1, Math.floor((x / newCols) * sC));
      const sy = Math.min(sR - 1, Math.floor((y / newRows) * sR));
      return src[sy]![sx]!;
    }),
  );
}

function paintAt(
  grid: Pixel[][],
  x: number,
  y: number,
  apply: (p: Pixel) => Pixel,
): Pixel[][] {
  if (y < 0 || y >= grid.length) return grid;
  const row = grid[y]!;
  if (x < 0 || x >= row.length) return grid;
  const next = grid.map((r, ry) =>
    ry === y ? r.map((p, rx) => (rx === x ? apply(p) : p)) : r,
  );
  return next;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FG_COLOR':
      return { ...state, fgColor: action.color };
    case 'SET_BG_COLOR':
      return { ...state, bgColor: action.color };
    case 'TOGGLE_PICKER':
      return { ...state, picking: !state.picking };
    case 'OPEN_SAVE_PROMPT':
      return {
        ...state,
        prompt: { kind: 'savePath', value: action.initial ?? '' },
      };
    case 'OPEN_FILE_PICKER':
      return { ...state, prompt: { kind: 'openFile' } };
    case 'OPEN_AI_PROMPT':
      return {
        ...state,
        prompt: { kind: 'aiPrompt', value: action.initial ?? '' },
      };
    case 'OPEN_API_KEY_PROMPT':
      return { ...state, prompt: { kind: 'apiKey', value: '' } };
    case 'UPDATE_PROMPT_VALUE':
      if (
        state.prompt?.kind !== 'savePath' &&
        state.prompt?.kind !== 'aiPrompt' &&
        state.prompt?.kind !== 'apiKey'
      )
        return state;
      return { ...state, prompt: { ...state.prompt, value: action.value } };
    case 'CLOSE_PROMPT':
      return state.prompt ? { ...state, prompt: null } : state;
    case 'SET_GENERATING':
      return { ...state, generating: action.value };
    case 'SET_SHARPNESS':
      return {
        ...state,
        sharpness: Math.max(0, Math.min(100, action.value)),
      };
    case 'PICK_PIXEL': {
      const row = state.grid[action.y];
      const p = row?.[action.x];
      if (!p) return { ...state, picking: false };
      return {
        ...state,
        fgColor: p.top ?? state.fgColor,
        bgColor: p.bottom ?? state.bgColor,
        picking: false,
      };
    }
    case 'INVERT_IMAGE': {
      const grid = state.grid.map((row) =>
        row.map((p) => ({
          top: invertColor(p.top),
          bottom: invertColor(p.bottom),
        })),
      );
      // Discrete action — always record a history entry so it's undoable.
      const history = state.history.concat([state.grid]);
      if (history.length > 100) history.splice(0, history.length - 100);
      // User has now altered the imported image, so further resizes can no
      // longer cleanly re-decode from source.
      return {
        ...state,
        grid,
        history,
        strokeOpen: false,
        dirty: true,
        imageSource: null,
        imageChromaKey: null,
      };
    }
    case 'TOGGLE_PAINT_TOP':
      return { ...state, paintTop: !state.paintTop };
    case 'TOGGLE_PAINT_BOTTOM':
      return { ...state, paintBottom: !state.paintBottom };
    case 'SET_TEST_BG':
      return { ...state, testBg: action.bg };
    case 'PAINT_CELL': {
      // Top/Bottom toggles say which halves of the pixel get the foreground
      // color; the other halves get the background color. Each is then alpha-
      // blended onto whatever is already there (or the test bg for transparent
      // pixels), producing flat RGB — alpha is consumed at paint time because
      // SGR can't carry it.
      const topPick = state.paintTop ? state.fgColor : state.bgColor;
      const bottomPick = state.paintBottom ? state.fgColor : state.bgColor;
      const grid = paintAt(state.grid, action.x, action.y, (p) => ({
        top: blendColors(topPick, p.top, state.testBg),
        bottom: blendColors(bottomPick, p.bottom, state.testBg),
      }));
      if (grid === state.grid) return state;
      const hist = maybePushHistory(state);
      // Any user paint invalidates the "still pristine from source image" claim.
      return { ...state, grid, dirty: true, imageSource: null, imageChromaKey: null, ...hist };
    }
    case 'ERASE_CELL': {
      const grid = paintAt(state.grid, action.x, action.y, () => ({
        top: null,
        bottom: null,
      }));
      if (grid === state.grid) return state;
      const hist = maybePushHistory(state);
      return { ...state, grid, dirty: true, imageSource: null, imageChromaKey: null, ...hist };
    }
    case 'BEGIN_STROKE':
      return { ...state, strokeOpen: true };
    case 'END_STROKE':
      return state.strokeOpen ? { ...state, strokeOpen: false } : state;
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const history = state.history.slice(0, -1);
      const grid = state.history[state.history.length - 1]!;
      // RESIZE_GRID can change dimensions, so derive rows/cols from the grid.
      const rows = grid.length;
      const cols = rows ? grid[0]!.length : 0;
      return {
        ...state,
        grid,
        rows,
        cols,
        history,
        strokeOpen: false,
        dirty: true,
      };
    }
    case 'LOAD_GRID': {
      const rows = action.grid.length;
      const cols = rows ? action.grid[0]!.length : 0;
      return {
        ...state,
        grid: action.grid,
        pristineGrid: action.grid,
        rows,
        cols,
        filePath:
          action.filePath !== undefined ? action.filePath : state.filePath,
        imageSource:
          action.imageSource !== undefined ? action.imageSource : null,
        imageChromaKey:
          action.imageChromaKey !== undefined ? action.imageChromaKey : null,
        dirty: false,
        history: [],
        strokeOpen: false,
      };
    }
    case 'TRIM_GRID': {
      const edge = action.edge;
      if ((edge === 'top' || edge === 'bottom') && state.rows <= 1) return state;
      if ((edge === 'left' || edge === 'right') && state.cols <= 1) return state;
      let grid: Pixel[][];
      switch (edge) {
        case 'top':
          grid = state.grid.slice(1);
          break;
        case 'bottom':
          grid = state.grid.slice(0, -1);
          break;
        case 'left':
          grid = state.grid.map((row) => row.slice(1));
          break;
        case 'right':
          grid = state.grid.map((row) => row.slice(0, -1));
          break;
      }
      const rows = grid.length;
      const cols = rows ? grid[0]!.length : 0;
      // Push the prior grid so Undo restores the trimmed edge intact.
      const history = state.history.concat([state.grid]);
      if (history.length > HISTORY_LIMIT)
        history.splice(0, history.length - HISTORY_LIMIT);
      return {
        ...state,
        grid,
        // Commit the trim into pristine so a subsequent (non-shift) resize
        // operates on the trimmed source, not the original. Trim is a
        // user-intentional edit, like paint.
        pristineGrid: grid,
        rows,
        cols,
        history,
        strokeOpen: false,
        dirty: true,
        // Re-decoding from the imported image at new dims would undo the
        // trim, so detach from the source — same rule as a paint stroke.
        imageSource: null,
        imageChromaKey: null,
      };
    }
    case 'RESIZE_FROM_IMAGE': {
      const grid = action.grid;
      const rows = grid.length;
      const cols = rows ? grid[0]!.length : 0;
      // Push current to history so undo restores the prior (likely larger) size.
      const history = state.history.concat([state.grid]);
      if (history.length > HISTORY_LIMIT)
        history.splice(0, history.length - HISTORY_LIMIT);
      return {
        ...state,
        grid,
        pristineGrid: grid,
        rows,
        cols,
        history,
        strokeOpen: false,
        dirty: true,
        // Keep imageSource — subsequent resizes can still re-decode.
      };
    }
    case 'RESIZE_GRID': {
      const { rows, cols } = action;
      if (rows === state.rows && cols === state.cols) return state;
      if (rows < 1 || cols < 1) return state;
      const grid = resampleNearest(state.pristineGrid, rows, cols);
      // Record as a history entry so Undo restores the prior size.
      const history = state.history.concat([state.grid]);
      if (history.length > HISTORY_LIMIT)
        history.splice(0, history.length - HISTORY_LIMIT);
      return {
        ...state,
        grid,
        rows,
        cols,
        history,
        strokeOpen: false,
        dirty: true,
      };
    }
    case 'SET_FILE':
      return { ...state, filePath: action.filePath };
    case 'MARK_CLEAN':
      return { ...state, dirty: false };
    case 'SET_CURSOR':
      return { ...state, cursor: action.cursor };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    default:
      return state;
  }
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function StoreProvider({
  rows,
  cols,
  initialGrid,
  initialFilePath,
  initialImageSource,
  children,
}: {
  rows: number;
  cols: number;
  initialGrid?: Pixel[][];
  initialFilePath?: string | null;
  initialImageSource?: string | null;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const base = initialState(rows, cols);
    if (initialGrid && initialGrid.length) {
      const ig: Pixel[][] = Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => initialGrid[y]?.[x] ?? blankPixel()),
      );
      return {
        ...base,
        grid: ig,
        pristineGrid: initialGrid,
        filePath: initialFilePath ?? null,
        imageSource: initialImageSource ?? null,
      };
    }
    return {
      ...base,
      filePath: initialFilePath ?? null,
      imageSource: initialImageSource ?? null,
    };
  });
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useStore(): AppState {
  const v = useContext(StateCtx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

export function useDispatch(): Dispatch<Action> {
  const v = useContext(DispatchCtx);
  if (!v) throw new Error('useDispatch outside StoreProvider');
  return v;
}
