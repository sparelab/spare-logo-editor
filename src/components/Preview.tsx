import React from 'react';
import { Text } from 'ink';
import { useStore } from '../state/store.js';
import { ansi256ToRgb, blendColors, rgbToHex } from '../utils/ansi.js';
import type { Color } from '../state/types.js';

function colorToHex(c: Color): string | undefined {
  if (!c) return undefined;
  if (c.mode === 'rgb') return rgbToHex(c.r, c.g, c.b);
  const { r, g, b } = ansi256ToRgb(c.index);
  return rgbToHex(r, g, b);
}

/**
 * One pixel preview. Mirrors PAINT_CELL: pick fg/bg per toggle, then alpha-
 * blend onto the test bg (no underlying pixel exists in the preview).
 */
export function Preview() {
  const { fgColor, bgColor, paintTop, paintBottom, testBg } = useStore();
  const topPick = paintTop ? fgColor : bgColor;
  const bottomPick = paintBottom ? fgColor : bgColor;
  const top = blendColors(topPick, null, testBg);
  const bottom = blendColors(bottomPick, null, testBg);
  const tbg = colorToHex(testBg);
  const fg = colorToHex(top) ?? tbg;
  const bg = colorToHex(bottom) ?? tbg;
  return (
    <Text color={fg} backgroundColor={bg}>
      ▀
    </Text>
  );
}
