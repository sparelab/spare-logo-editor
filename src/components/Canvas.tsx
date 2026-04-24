import React from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { serializeRow } from '../io/serializer.js';
import { useClickable } from '../input/clickable.js';

export function Canvas() {
  const { grid, testBg, picking } = useStore();
  const dispatch = useDispatch();

  // Shift + left, or right, both mean "erase".
  const apply = (ev: { button: string; modifiers: { shift: boolean }; localX: number; localY: number }) => {
    const erase =
      ev.button === 'right' || (ev.button === 'left' && ev.modifiers.shift);
    if (erase) {
      dispatch({ type: 'ERASE_CELL', x: ev.localX, y: ev.localY });
    } else if (ev.button === 'left') {
      dispatch({ type: 'PAINT_CELL', x: ev.localX, y: ev.localY });
    }
    dispatch({
      type: 'SET_CURSOR',
      cursor: { x: ev.localX, y: ev.localY },
    });
  };
  const ref = useClickable({
    onDown: (ev) => {
      if (picking && ev.button === 'left') {
        dispatch({ type: 'PICK_PIXEL', x: ev.localX, y: ev.localY });
        dispatch({
          type: 'SET_CURSOR',
          cursor: { x: ev.localX, y: ev.localY },
        });
        return;
      }
      dispatch({ type: 'BEGIN_STROKE' });
      apply(ev);
    },
    onDrag: (ev) => {
      if (picking) return;
      apply(ev);
    },
    onUp: () => {
      if (!picking) dispatch({ type: 'END_STROKE' });
    },
    onMove: (ev) => {
      dispatch({
        type: 'SET_CURSOR',
        cursor: { x: ev.localX, y: ev.localY },
      });
    },
  });

  return (
    <Box flexDirection="column" ref={ref} flexGrow={1}>
      {grid.map((row, y) => (
        <Text key={y}>{serializeRow(row, testBg)}</Text>
      ))}
    </Box>
  );
}
