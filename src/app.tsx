import React from 'react';
import { Box, useApp, useInput, useWindowSize } from 'ink';
import { LeftPanel, LEFT_PANEL_WIDTH } from './components/LeftPanel.js';
import { Canvas } from './components/Canvas.js';
import { StatusBar } from './components/StatusBar.js';
import { SavePrompt, saveToPath } from './components/SavePrompt.js';
import { FilePicker } from './components/FilePicker.js';
import { AiPrompt } from './components/AiPrompt.js';
import { useDispatch, useStore } from './state/store.js';
import { ClickableProvider } from './input/clickable.js';
import { MouseRouter } from './input/MouseRouter.js';
import { DropImport } from './input/DropImport.js';
import { loadImageAsGrid } from './io/image.js';

/**
 * Dispatch a resize. If the current grid is still pristine from an imported
 * image, re-decode the source at the new dimensions for higher quality
 * (avoids stacking nearest-neighbor passes). Otherwise nearest-neighbor
 * resample from `pristineGrid` via RESIZE_GRID.
 */
export function useResize() {
  const state = useStore();
  const dispatch = useDispatch();
  return (cols: number, rows: number) => {
    if (state.imageSource) {
      const src = state.imageSource;
      loadImageAsGrid(src, cols, rows, {
        sharpness: state.sharpness,
        ...(state.imageChromaKey ? { chromaKey: state.imageChromaKey } : {}),
      })
        .then((grid) => dispatch({ type: 'RESIZE_FROM_IMAGE', grid }))
        .catch(() => dispatch({ type: 'RESIZE_GRID', cols, rows }));
      return;
    }
    dispatch({ type: 'RESIZE_GRID', cols, rows });
  };
}

/** Maximum grid dimensions that fit alongside the panel + status bar. */
export function useCanvasBounds() {
  const { columns, rows } = useWindowSize();
  return {
    maxCols: Math.max(1, columns - LEFT_PANEL_WIDTH),
    maxRows: Math.max(1, rows - 1),
  };
}

function Hotkeys() {
  const { exit } = useApp();
  const dispatch = useDispatch();
  const state = useStore();
  const { maxCols, maxRows } = useCanvasBounds();
  const resize = useResize();

  useInput((input, key) => {
    if (state.prompt) return; // SavePrompt owns input while modal is open
    if (input === 'q') return exit();
    if (input === 'z' || key.backspace) {
      return dispatch({ type: 'UNDO' });
    }
    if (input === 's') {
      const path = state.filePath;
      if (!path) {
        dispatch({ type: 'OPEN_SAVE_PROMPT' });
        return;
      }
      saveToPath(path, state, dispatch);
      return;
    }
    if (input === 'o') {
      dispatch({ type: 'OPEN_FILE_PICKER' });
      return;
    }
    if (input === 'g') {
      dispatch({ type: 'OPEN_AI_PROMPT' });
      return;
    }
    if (input === 't') return dispatch({ type: 'TOGGLE_PAINT_TOP' });
    if (input === 'b') return dispatch({ type: 'TOGGLE_PAINT_BOTTOM' });
    if (input === 'i') return dispatch({ type: 'INVERT_IMAGE' });
    if (input === 'p') return dispatch({ type: 'TOGGLE_PICKER' });
    if (key.escape && state.picking) return dispatch({ type: 'TOGGLE_PICKER' });
    // Arrow keys resize each axis independently.
    //   ←/→ width  ·  ↓/↑ height
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      // Shift + arrow: lossless trim from the corresponding edge.
      if (key.shift) {
        const edge =
          key.upArrow ? 'top'
          : key.downArrow ? 'bottom'
          : key.leftArrow ? 'left'
          : 'right';
        dispatch({ type: 'TRIM_GRID', edge });
        return;
      }
      const dCols = key.rightArrow ? 1 : key.leftArrow ? -1 : 0;
      const dRows = key.upArrow ? 1 : key.downArrow ? -1 : 0;
      const cols = Math.min(maxCols, Math.max(1, state.cols + dCols));
      const rows = Math.min(maxRows, Math.max(1, state.rows + dRows));
      resize(cols, rows);
    }
  });
  return null;
}

export function App() {
  const { rows: termRows } = useWindowSize();
  return (
    <ClickableProvider>
      <MouseRouter />
      <DropImport />
      <Hotkeys />
      <Box flexDirection="column" height={termRows}>
        <Box flexDirection="row" flexGrow={1} overflow="hidden">
          <LeftPanel />
          <Canvas />
        </Box>
        <SavePrompt />
        <FilePicker />
        <AiPrompt />
        <StatusBar />
      </Box>
    </ClickableProvider>
  );
}
