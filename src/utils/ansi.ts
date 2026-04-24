import type { Color } from '../state/types.js';

export const ESC = '\x1b';
export const CSI = `${ESC}[`;
export const RESET = `${CSI}0m`;
export const FG_DEFAULT = `${CSI}39m`;
export const BG_DEFAULT = `${CSI}49m`;

export function fgEscape(c: Color): string {
  if (c === null) return FG_DEFAULT;
  if (c.mode === '256') return `${CSI}38;5;${c.index}m`;
  return `${CSI}38;2;${c.r};${c.g};${c.b}m`;
}

export function bgEscape(c: Color): string {
  if (c === null) return BG_DEFAULT;
  if (c.mode === '256') return `${CSI}48;5;${c.index}m`;
  return `${CSI}48;2;${c.r};${c.g};${c.b}m`;
}

export function colorsEqual(a: Color, b: Color): boolean {
  if (a === null || b === null) return a === b;
  if (a.mode !== b.mode) return false;
  if (a.mode === '256' && b.mode === '256') return a.index === b.index;
  if (a.mode === 'rgb' && b.mode === 'rgb')
    return a.r === b.r && a.g === b.g && a.b === b.b;
  return false;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    if (!/^[0-9a-fA-F]{3}$/.test(s)) return null;
    const r = parseInt(s[0]! + s[0]!, 16);
    const g = parseInt(s[1]! + s[1]!, 16);
    const b = parseInt(s[2]! + s[2]!, 16);
    return { r, g, b };
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorToRgb(c: Color): { r: number; g: number; b: number } | null {
  if (!c) return null;
  if (c.mode === 'rgb') return { r: c.r, g: c.g, b: c.b };
  return ansi256ToRgb(c.index);
}

/**
 * Blend `over` (with optional alpha) onto `under`. If `under` is transparent,
 * fall back to `fallback` (typically the test bg) so alpha < 255 still has
 * something to mix against. Returns a flat RGB Color (alpha consumed).
 *
 * Why: SGR escape codes carry no alpha, so opacity is meaningful only at
 * paint time. We composite once and store the result as plain RGB.
 */
export function blendColors(
  over: Color,
  under: Color,
  fallback: Color = null,
): Color {
  if (!over) return under;
  const a = over.mode === 'rgb' && typeof over.a === 'number' ? over.a : 255;
  if (a >= 255) {
    if (over.mode === 'rgb' && over.a !== undefined) {
      return { mode: 'rgb', r: over.r, g: over.g, b: over.b };
    }
    return over;
  }
  if (a <= 0) return under;
  const o = colorToRgb(over)!;
  const u = colorToRgb(under) ?? colorToRgb(fallback) ?? { r: 0, g: 0, b: 0 };
  const mix = (oc: number, uc: number) =>
    Math.round((oc * a + uc * (255 - a)) / 255);
  return { mode: 'rgb', r: mix(o.r, u.r), g: mix(o.g, u.g), b: mix(o.b, u.b) };
}

/** Pick black or white text for legibility on the given Color. Null = no bg → assume terminal default → white. */
export function contrastingText(c: Color): 'black' | 'white' {
  if (!c) return 'white';
  const rgb = c.mode === '256' ? ansi256ToRgb(c.index) : c;
  // Per ITU-R BT.601 luma coefficients.
  const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luma > 160 ? 'black' : 'white';
}

/** Build the 256-color palette as RGB so we can render swatches in any mode. */
export function ansi256ToRgb(i: number): { r: number; g: number; b: number } {
  if (i < 16) {
    const basic = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ];
    const [r, g, b] = basic[i]!;
    return { r: r!, g: g!, b: b! };
  }
  if (i < 232) {
    const n = i - 16;
    const r = Math.floor(n / 36);
    const g = Math.floor((n % 36) / 6);
    const b = n % 6;
    const v = (k: number) => (k === 0 ? 0 : 55 + k * 40);
    return { r: v(r), g: v(g), b: v(b) };
  }
  const v = 8 + (i - 232) * 10;
  return { r: v, g: v, b: v };
}
