import React from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { contrastingText, rgbToHex } from '../utils/ansi.js';
import { useClickable } from '../input/clickable.js';

const GRAY_STEPS = 16;

const HUE_STOPS: { r: number; g: number; b: number }[] = [
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 128, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
];

const TOTAL = GRAY_STEPS + HUE_STOPS.length;

function colorAt(i: number): { r: number; g: number; b: number } {
  if (i < GRAY_STEPS) {
    const v = Math.round((i / (GRAY_STEPS - 1)) * 255);
    return { r: v, g: v, b: v };
  }
  return HUE_STOPS[i - GRAY_STEPS]!;
}

function activeIndexFor(testBg: ReturnType<typeof useStore>['testBg']): number {
  if (!testBg || testBg.mode !== 'rgb') return -1;
  for (let i = 0; i < TOTAL; i++) {
    const c = colorAt(i);
    if (c.r === testBg.r && c.g === testBg.g && c.b === testBg.b) return i;
  }
  return -1;
}

function Palette() {
  const { testBg } = useStore();
  const dispatch = useDispatch();
  const activeIdx = activeIndexFor(testBg);
  const setIdx = (i: number) => {
    const j = Math.max(0, Math.min(TOTAL - 1, i));
    const c = colorAt(j);
    dispatch({ type: 'SET_TEST_BG', bg: { mode: 'rgb', ...c } });
  };
  const ref = useClickable({
    onDown: (ev) => setIdx(ev.localX),
    onDrag: (ev) => setIdx(ev.localX),
  });
  return (
    <Box ref={ref}>
      {Array.from({ length: TOTAL }, (_, i) => {
        const c = colorAt(i);
        const hex = rgbToHex(c.r, c.g, c.b);
        const isActive = i === activeIdx;
        return (
          <Text key={i} backgroundColor={hex}>
            {isActive ? (
              <Text bold color={contrastingText({ mode: 'rgb', ...c })}>
                ▲
              </Text>
            ) : (
              ' '
            )}
          </Text>
        );
      })}
    </Box>
  );
}

export function TestBgPicker() {
  return (
    <Box flexDirection="column">
      <Text bold>Preview Background</Text>
      <Palette />
    </Box>
  );
}
