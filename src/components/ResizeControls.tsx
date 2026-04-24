import React from 'react';
import { Box, Text } from 'ink';
import { useStore } from '../state/store.js';
import { useClickable } from '../input/clickable.js';
import { useCanvasBounds, useResize } from '../app.js';

function ArrowButton({
  glyph,
  onClick,
}: {
  glyph: string;
  onClick: () => void;
}) {
  const ref = useClickable({ onDown: onClick });
  return (
    <Box ref={ref}>
      <Text backgroundColor="#222244">
        {' '}
        <Text bold color="white">
          {glyph}
        </Text>
        {' '}
      </Text>
    </Box>
  );
}

export function ResizeControls() {
  const { rows, cols } = useStore();
  const { maxCols, maxRows } = useCanvasBounds();
  const resize = useResize();
  const set = (newCols: number, newRows: number) =>
    resize(
      Math.min(maxCols, Math.max(1, newCols)),
      Math.min(maxRows, Math.max(1, newRows)),
    );
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Resize </Text>
        <Text dimColor>(Shift to trim)</Text>
      </Box>
      <Box>
        <Text>W </Text>
        <ArrowButton glyph="◀" onClick={() => set(cols - 1, rows)} />
        <Text> {String(cols).padStart(3)} </Text>
        <ArrowButton glyph="▶" onClick={() => set(cols + 1, rows)} />
      </Box>
      <Box>
        <Text>H </Text>
        <ArrowButton glyph="▼" onClick={() => set(cols, rows - 1)} />
        <Text> {String(rows).padStart(3)} </Text>
        <ArrowButton glyph="▲" onClick={() => set(cols, rows + 1)} />
      </Box>
    </Box>
  );
}
