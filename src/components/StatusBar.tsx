import React from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { useStore } from '../state/store.js';

export function StatusBar() {
  const { cursor, filePath, dirty, status, rows, cols, paintTop, paintBottom, history } =
    useStore();
  const { columns } = useWindowSize();
  const path = filePath ?? '<unsaved>';
  const star = dirty ? '*' : ' ';
  const cur = cursor ? `${cursor.x},${cursor.y}` : '   ';
  const tgt = `${paintTop ? 'T' : '-'}${paintBottom ? 'B' : '-'}`;
  const undoHint = history.length > 0 ? '  (z to undo)' : '';
  const body = ` ${star}${path}  ${cols}×${rows}  cur:${cur}  pixel:${tgt}${undoHint}${
    status ? `  ${status}` : ''
  } `;
  // Pad with spaces so the inverse background spans the full terminal width.
  const line =
    body.length >= columns ? body.slice(0, columns) : body.padEnd(columns, ' ');
  return (
    <Box flexShrink={0} height={1} width={columns}>
      <Text inverse>{line}</Text>
    </Box>
  );
}
