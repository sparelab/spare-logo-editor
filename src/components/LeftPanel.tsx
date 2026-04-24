import React from 'react';
import { Box, Text, useApp } from 'ink';
import { TargetSelector } from './TargetSelector.js';
import { FgColorPicker, BgColorPicker } from './ColorPicker.js';
import { TestBgPicker } from './TestBgPicker.js';
import { ResizeControls } from './ResizeControls.js';
import { SharpnessSlider } from './SharpnessSlider.js';
import { AiButton } from './AiButton.js';
import { AnimatedTitle } from './AnimatedTitle.js';
import { useDispatch, useStore } from '../state/store.js';
import { useClickable } from '../input/clickable.js';
import { saveToPath } from './SavePrompt.js';

function OpenButton() {
  const dispatch = useDispatch();
  const ref = useClickable({ onDown: () => dispatch({ type: 'OPEN_FILE_PICKER' }) });
  return (
    <Box ref={ref}>
      <Text backgroundColor="#0a3a5a">
        {' '}
        <Text bold color="white">
          O
        </Text>
        pen{' '}
      </Text>
    </Box>
  );
}

export const LEFT_PANEL_WIDTH = 28;

function SaveButton() {
  const state = useStore();
  const dispatch = useDispatch();
  const ref = useClickable({
    onDown: () => {
      const path = state.filePath;
      if (!path) {
        dispatch({ type: 'OPEN_SAVE_PROMPT' });
        return;
      }
      saveToPath(path, state, dispatch);
    },
  });
  return (
    <Box ref={ref}>
      <Text backgroundColor="#0a5a0a">
        {' '}
        <Text bold color="white">
          S
        </Text>
        ave{' '}
      </Text>
    </Box>
  );
}

function QuitButton() {
  const { exit } = useApp();
  const ref = useClickable({ onDown: () => exit() });
  return (
    <Box ref={ref}>
      <Text backgroundColor="#7a0a0a">
        {' '}
        <Text bold color="white">
          Q
        </Text>
        uit{' '}
      </Text>
    </Box>
  );
}

export function LeftPanel() {
  return (
    <Box
      flexDirection="column"
      width={LEFT_PANEL_WIDTH}
      borderStyle="single"
      paddingX={1}
    >
      <Box justifyContent="center">
        <AnimatedTitle text="Spare Logo Editor" />
      </Box>
      <Box marginTop={1}>
        <TargetSelector />
      </Box>
      <Box marginTop={1}>
        <FgColorPicker />
      </Box>
      <Box marginTop={1}>
        <BgColorPicker />
      </Box>
      <Box marginTop={1}>
        <TestBgPicker />
      </Box>
      <Box marginTop={1}>
        <ResizeControls />
      </Box>
      <Box marginTop={1}>
        <SharpnessSlider />
      </Box>
      <Box marginTop={1}>
        <AiButton />
      </Box>
      <Box marginTop={1}>
        <OpenButton />
        <Box marginLeft={1}>
          <SaveButton />
        </Box>
        <Box marginLeft={1}>
          <QuitButton />
        </Box>
      </Box>
    </Box>
  );
}
