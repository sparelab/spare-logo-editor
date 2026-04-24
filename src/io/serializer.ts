import type { Color, Pixel } from '../state/types.js';
import {
  RESET,
  bgEscape,
  colorsEqual,
  fgEscape,
} from '../utils/ansi.js';

/**
 * Pick the cell character + the (fg, bg) escapes needed to paint it.
 *
 * Why this matters: a cell rendered as ▀ uses FG for the top half and BG for
 * the bottom half. When FG is unset, terminals render ▀ in their *default*
 * foreground color (usually light gray), which makes empty rows look like
 * horizontal stripes. So we choose the character per cell:
 *
 *   - both halves transparent → ' ' (only BG visible, fully flat)
 *   - top transparent, bottom set → '▄' with FG=bottom, BG=transparent
 *   - top set, bottom transparent → '▀' with FG=top, BG=transparent
 *   - both set, equal → '█' with FG=top
 *   - both set, different → '▀' with FG=top, BG=bottom
 */
function chooseCell(
  top: Color,
  bottom: Color,
): { ch: string; fg: Color; bg: Color } {
  if (top === null && bottom === null) return { ch: ' ', fg: null, bg: null };
  if (top === null) return { ch: '▄', fg: bottom, bg: null };
  if (bottom === null) return { ch: '▀', fg: top, bg: null };
  if (colorsEqual(top, bottom)) return { ch: '█', fg: top, bg: null };
  return { ch: '▀', fg: top, bg: bottom };
}

/** Render one row to a string. Test bg substitutes for null bottoms (preview only). */
export function serializeRow(row: Pixel[], testBg: Color = null): string {
  let out = '';
  let curFg: Color | undefined = undefined;
  let curBg: Color | undefined = undefined;
  for (const cell of row) {
    // Apply test bg to cells whose bottom is transparent so we can preview
    // against a chosen background without mutating state.
    const effectiveBottom = cell.bottom !== null ? cell.bottom : testBg;
    const effectiveTop = cell.top !== null ? cell.top : testBg;
    const { ch, fg, bg } = chooseCell(effectiveTop, effectiveBottom);
    if (curFg === undefined || !colorsEqual(curFg, fg)) {
      out += fgEscape(fg);
      curFg = fg;
    }
    if (curBg === undefined || !colorsEqual(curBg, bg)) {
      out += bgEscape(bg);
      curBg = bg;
    }
    out += ch;
  }
  out += RESET;
  return out;
}

/** Serialize the full grid for save (no test bg). Trailing newline included. */
export function serializeGrid(grid: Pixel[][]): string {
  const lines = grid.map((r) => serializeRow(r, null));
  return lines.join('\n') + '\n';
}
