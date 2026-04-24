import React from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { useClickable } from '../input/clickable.js';
import { loadImageAsGrid } from '../io/image.js';

const BAR_WIDTH = 16;
const MAX = 100;

/**
 * Sidebar control for the unsharp-mask amount applied during image import.
 * Only meaningful while imageSource is still set (i.e. you imported a PNG/JPG
 * and haven't painted on it yet). Dragging the bar re-decodes the source at
 * the current dims with the new sharpness.
 */
export function SharpnessSlider() {
  const { sharpness, imageSource, cols, rows } = useStore();
  const dispatch = useDispatch();
  const enabled = !!imageSource;

  const apply = (value: number) => {
    const clamped = Math.max(0, Math.min(MAX, value));
    dispatch({ type: 'SET_SHARPNESS', value: clamped });
    if (!imageSource) return;
    const src = imageSource;
    loadImageAsGrid(src, cols, rows, { sharpness: clamped })
      .then((grid) => dispatch({ type: 'RESIZE_FROM_IMAGE', grid }))
      .catch(() => {
        /* ignore — keep previous grid */
      });
  };

  const setFromLocal = (localX: number) => {
    if (!enabled) return;
    const i = Math.max(0, Math.min(BAR_WIDTH - 1, localX));
    apply(Math.round((i / (BAR_WIDTH - 1)) * MAX));
  };

  const ref = useClickable({
    onDown: (ev) => setFromLocal(ev.localX),
    onDrag: (ev) => setFromLocal(ev.localX),
  });

  const filled = Math.round((sharpness / MAX) * BAR_WIDTH);
  const bar = '█'.repeat(filled).padEnd(BAR_WIDTH, '·');
  const color = enabled ? 'yellow' : 'gray';

  return (
    <Box flexDirection="column">
      <Text bold>Sharpness</Text>
      <Box>
        <Box ref={ref}>
          <Text color={color}>{bar}</Text>
        </Box>
        <Text> {String(sharpness).padStart(3)}</Text>
      </Box>
      {!enabled && (
        <Text dimColor>(import an image)</Text>
      )}
    </Box>
  );
}
