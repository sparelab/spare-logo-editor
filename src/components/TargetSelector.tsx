import React from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { useClickable } from '../input/clickable.js';
import type { Action } from '../state/types.js';
import { Preview } from './Preview.js';

function ToggleButton({
  label,
  active,
  action,
}: {
  label: string;
  active: boolean;
  action: Action;
}) {
  const dispatch = useDispatch();
  const ref = useClickable({ onDown: () => dispatch(action) });
  const first = label[0]!;
  const rest = label.slice(1);
  return (
    <Box ref={ref} marginRight={1}>
      <Text backgroundColor={active ? '#0a5a5a' : undefined}>
        {' '}
        <Text bold color="white">
          {first}
        </Text>
        {rest}
        {' '}
      </Text>
    </Box>
  );
}

export function TargetSelector() {
  const { paintTop, paintBottom } = useStore();
  return (
    <Box flexDirection="column">
      <Text bold>Pixel</Text>
      <Box>
        <ToggleButton
          label="Top"
          active={paintTop}
          action={{ type: 'TOGGLE_PAINT_TOP' }}
        />
        <ToggleButton
          label="Bottom"
          active={paintBottom}
          action={{ type: 'TOGGLE_PAINT_BOTTOM' }}
        />
        <Preview />
      </Box>
    </Box>
  );
}
