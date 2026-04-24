import React from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { rgbToHex } from '../utils/ansi.js';
import { RGBSliders } from './RGBSliders.js';
import { useClickable } from '../input/clickable.js';

function InvertButton() {
  const dispatch = useDispatch();
  const ref = useClickable({ onDown: () => dispatch({ type: 'INVERT_IMAGE' }) });
  return (
    <Box ref={ref}>
      <Text backgroundColor="#5a0a5a">
        {' '}
        <Text bold color="white">
          I
        </Text>
        nvert{' '}
      </Text>
    </Box>
  );
}

function PickButton() {
  const { picking } = useStore();
  const dispatch = useDispatch();
  const ref = useClickable({ onDown: () => dispatch({ type: 'TOGGLE_PICKER' }) });
  return (
    <Box ref={ref}>
      <Text backgroundColor={picking ? '#a07a00' : '#0a2a5a'}>
        {' '}
        <Text bold color="white">
          P
        </Text>
        ick{' '}
      </Text>
    </Box>
  );
}

export function FgColorPicker() {
  const { fgColor } = useStore();
  const dispatch = useDispatch();
  const hex =
    fgColor?.mode === 'rgb' ? rgbToHex(fgColor.r, fgColor.g, fgColor.b) : undefined;
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Foreground </Text>
        <Text color={hex}>████</Text>
      </Box>
      <RGBSliders
        value={fgColor}
        onChange={(c) => dispatch({ type: 'SET_FG_COLOR', color: c })}
      />
    </Box>
  );
}

export function BgColorPicker() {
  const { bgColor } = useStore();
  const dispatch = useDispatch();
  const hex =
    bgColor?.mode === 'rgb' ? rgbToHex(bgColor.r, bgColor.g, bgColor.b) : undefined;
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Background </Text>
        <Text color={hex}>████</Text>
      </Box>
      <RGBSliders
        value={bgColor}
        onChange={(c) => dispatch({ type: 'SET_BG_COLOR', color: c })}
      />
      <Box marginTop={1}>
        <InvertButton />
        <Box marginLeft={1}>
          <PickButton />
        </Box>
      </Box>
    </Box>
  );
}
