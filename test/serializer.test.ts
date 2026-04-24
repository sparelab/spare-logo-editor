import { describe, expect, test } from 'bun:test';
import { serializeGrid, serializeRow } from '../src/io/serializer.ts';
import { parseAnsi } from '../src/io/parser.ts';
import type { Pixel } from '../src/state/types.ts';
import { blankPixel } from '../src/state/types.ts';

const c256 = (i: number): Pixel['top'] => ({ mode: '256', index: i });
const crgb = (r: number, g: number, b: number): Pixel['top'] => ({
  mode: 'rgb',
  r,
  g,
  b,
});

function gridsEqual(a: Pixel[][], b: Pixel[][]): boolean {
  if (a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y]!.length !== b[y]!.length) return false;
    for (let x = 0; x < a[y]!.length; x++) {
      const pa = a[y]![x]!;
      const pb = b[y]![x]!;
      if (JSON.stringify(pa) !== JSON.stringify(pb)) return false;
    }
  }
  return true;
}

describe('serializer + parser round-trip', () => {
  test('all transparent', () => {
    const g: Pixel[][] = [
      [blankPixel(), blankPixel()],
      [blankPixel(), blankPixel()],
    ];
    expect(gridsEqual(parseAnsi(serializeGrid(g)), g)).toBe(true);
  });

  test('mixed 256 colors', () => {
    const g: Pixel[][] = [
      [
        { top: c256(1), bottom: c256(2) },
        { top: c256(15), bottom: null },
      ],
      [
        { top: null, bottom: c256(8) },
        { top: c256(231), bottom: c256(196) },
      ],
    ];
    expect(gridsEqual(parseAnsi(serializeGrid(g)), g)).toBe(true);
  });

  test('truecolor', () => {
    const g: Pixel[][] = [
      [
        { top: crgb(255, 136, 0), bottom: crgb(0, 0, 0) },
        { top: crgb(10, 20, 30), bottom: null },
      ],
    ];
    expect(gridsEqual(parseAnsi(serializeGrid(g)), g)).toBe(true);
  });

  test('serializeRow injects testBg only where bottom is null', () => {
    const row: Pixel[] = [
      { top: c256(15), bottom: null },
      { top: c256(15), bottom: c256(0) },
    ];
    const s = serializeRow(row, c256(240));
    // bottom-null cell should be painted with bg 240; bottom=0 cell unaffected
    expect(s).toContain('48;5;240');
    expect(s).toContain('48;5;0');
  });
});
