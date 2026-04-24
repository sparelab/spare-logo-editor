import type { Color, Pixel } from '../state/types.js';
import { blankPixel } from '../state/types.js';

/**
 * Parse an ANSI-encoded SGR image text back into a Pixel grid.
 * Recognizes ▀ ▄ █ and space combined with the current FG/BG state.
 */
export function parseAnsi(text: string): Pixel[][] {
  const grid: Pixel[][] = [];
  let row: Pixel[] = [];
  let fg: Color = null;
  let bg: Color = null;

  const pushRow = () => {
    grid.push(row);
    row = [];
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    // CSI sequence
    if (ch === '\x1b' && text[i + 1] === '[') {
      // Find the final byte (any letter)
      let j = i + 2;
      while (j < text.length && !/[A-Za-z]/.test(text[j]!)) j++;
      if (j >= text.length) break;
      const final = text[j]!;
      const params = text.slice(i + 2, j);
      i = j + 1;
      if (final !== 'm') continue;
      applySgr(params, (newFg, newBg) => {
        if (newFg !== undefined) fg = newFg;
        if (newBg !== undefined) bg = newBg;
      }, () => {
        fg = null;
        bg = null;
      });
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    // A printable cell.
    const cell = pixelFor(ch, fg, bg);
    row.push(cell);
    i++;
  }
  if (row.length) pushRow();
  // Drop trailing blank rows from a trailing newline.
  while (grid.length && grid[grid.length - 1]!.length === 0) grid.pop();

  // Pad rows to equal width
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  for (const r of grid) while (r.length < width) r.push(blankPixel());
  return grid;
}

function pixelFor(ch: string, fg: Color, bg: Color): Pixel {
  switch (ch) {
    case '▀':
      return { top: fg, bottom: bg };
    case '▄':
      return { top: bg, bottom: fg };
    case '█':
      return { top: fg, bottom: fg };
    case ' ':
      return { top: bg, bottom: bg };
    default:
      // Unknown char — treat as full block so we don't drop content.
      return { top: fg, bottom: fg };
  }
}

/**
 * Walk SGR parameter list (semicolon-separated). Calls onColor for FG/BG
 * updates and onReset for the full reset code 0.
 */
function applySgr(
  params: string,
  onColor: (fg: Color | undefined, bg: Color | undefined) => void,
  onReset: () => void,
): void {
  const parts = params.split(';').map((p) => (p === '' ? 0 : Number(p)));
  let i = 0;
  while (i < parts.length) {
    const code = parts[i]!;
    if (code === 0) {
      onReset();
      i++;
      continue;
    }
    if (code === 39) {
      onColor(null, undefined);
      i++;
      continue;
    }
    if (code === 49) {
      onColor(undefined, null);
      i++;
      continue;
    }
    if (code === 38 || code === 48) {
      const which = code === 38 ? 'fg' : 'bg';
      const sub = parts[i + 1];
      if (sub === 5 && parts[i + 2] !== undefined) {
        const c: Color = { mode: '256', index: parts[i + 2]! };
        which === 'fg' ? onColor(c, undefined) : onColor(undefined, c);
        i += 3;
        continue;
      }
      if (sub === 2 && parts[i + 4] !== undefined) {
        const c: Color = {
          mode: 'rgb',
          r: parts[i + 2]!,
          g: parts[i + 3]!,
          b: parts[i + 4]!,
        };
        which === 'fg' ? onColor(c, undefined) : onColor(undefined, c);
        i += 5;
        continue;
      }
      i++;
      continue;
    }
    if (code >= 30 && code <= 37) {
      onColor({ mode: '256', index: code - 30 }, undefined);
      i++;
      continue;
    }
    if (code >= 40 && code <= 47) {
      onColor(undefined, { mode: '256', index: code - 40 });
      i++;
      continue;
    }
    if (code >= 90 && code <= 97) {
      onColor({ mode: '256', index: code - 90 + 8 }, undefined);
      i++;
      continue;
    }
    if (code >= 100 && code <= 107) {
      onColor(undefined, { mode: '256', index: code - 100 + 8 });
      i++;
      continue;
    }
    i++;
  }
}
