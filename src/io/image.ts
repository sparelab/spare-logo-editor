import { Jimp } from 'jimp';
import type { Pixel } from '../state/types.js';

export type LoadImageOptions = {
  /** Unsharp-mask amount applied after the downscale. 0 = off, 100 = strong. */
  sharpness?: number;
  /**
   * Chroma-key removal: pixels close to this RGB are turned transparent
   * (returned as `null` in the grid). `tolerance` is squared-RGB distance,
   * default 4500 (≈ Δ67 per channel).
   */
  chromaKey?: { r: number; g: number; b: number; tolerance?: number };
};

/**
 * Load a raster image and convert it to a Pixel grid.
 *
 * Each character cell stacks two image pixels vertically (top half + bottom
 * half rendered as ▀), so the image is resized to (cols × 2*rows) pixels.
 * The two pixels per cell are then read directly — same approach as imgcat.
 *
 * Fully transparent source pixels (a < 16) become null so the editor can
 * composite them against the test bg.
 */
export async function loadImageAsGrid(
  filePath: string,
  cols: number,
  rows: number,
  options: LoadImageOptions = {},
): Promise<Pixel[][]> {
  const img = await Jimp.read(filePath);
  // Two image pixels per character row.
  img.resize({ w: cols, h: rows * 2 });
  if (options.sharpness && options.sharpness > 0) {
    unsharpMask(img, options.sharpness / 100);
  }
  const ck = options.chromaKey;
  const ckTol = ck?.tolerance ?? 4500;
  const grid: Pixel[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Pixel[] = [];
    for (let x = 0; x < cols; x++) {
      row.push({
        top: pixelAt(img, x, y * 2, ck, ckTol),
        bottom: pixelAt(img, x, y * 2 + 1, ck, ckTol),
      });
    }
    grid.push(row);
  }
  return grid;
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

function pixelAt(
  img: JimpImage,
  x: number,
  y: number,
  ck?: LoadImageOptions['chromaKey'],
  ckTol?: number,
): Pixel['top'] {
  const c = img.getPixelColor(x, y);
  // Jimp packs RGBA into a 32-bit int.
  let r = (c >>> 24) & 0xff;
  let g = (c >>> 16) & 0xff;
  let b = (c >>> 8) & 0xff;
  const a = c & 0xff;
  if (a < 16) return null;
  if (ck && ckTol !== undefined) {
    const dr = r - ck.r;
    const dg = g - ck.g;
    const db = b - ck.b;
    if (dr * dr + dg * dg + db * db <= ckTol) return null;
    // Despill: a shadow cast on the chroma background blends to a dim
    // tint of the chroma colour. Without despill those tinted pixels keep
    // a green/purple cast even though the chroma fill is gone. We neutralise
    // the chroma channels so e.g. a green-tinted shadow becomes grey.
    const ds = despillChroma(r, g, b, ck);
    r = ds.r;
    g = ds.g;
    b = ds.b;
  }
  return { mode: 'rgb', r, g, b };
}

/**
 * Cap the channels that the chroma colour saturates so chroma "spill" on
 * shadows becomes neutral grey instead of a tinted halo. Recognises green
 * and magenta/purple chromas (the two we use); other chromas pass through.
 */
function despillChroma(
  r: number,
  g: number,
  b: number,
  ck: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const chromaR = ck.r > 200;
  const chromaG = ck.g > 200;
  const chromaB = ck.b > 200;
  // Green chroma (e.g. 0, 255, 119): cap green at max(red, blue) so a
  // dim green tint collapses to whatever non-green darkness is present.
  if (chromaG && !chromaR && !chromaB) {
    const cap = Math.max(r, b);
    return { r, g: Math.min(g, cap), b };
  }
  // Magenta/purple chroma (e.g. 255, 119, 255): cap red and blue at green
  // so a dim purple tint collapses to grey.
  if (chromaR && chromaB && !chromaG) {
    return { r: Math.min(r, g), g, b: Math.min(b, g) };
  }
  return { r, g, b };
}

/**
 * In-place unsharp mask: out = orig + amount * (orig - blurred).
 * `amount` is 0..2 (1 = subtle, 2 = aggressive). Operates on RGB only;
 * alpha is preserved.
 */
function unsharpMask(img: JimpImage, amount: number): void {
  if (amount <= 0) return;
  const { width, height, data } = img.bitmap;
  const blurred = img.clone().blur(1);
  const bdata = blurred.bitmap.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const br = bdata[i]!;
    const bg = bdata[i + 1]!;
    const bb = bdata[i + 2]!;
    data[i] = clamp255(r + amount * (r - br));
    data[i + 1] = clamp255(g + amount * (g - bg));
    data[i + 2] = clamp255(b + amount * (b - bb));
    // alpha (i+3) untouched
  }
  // Silence unused (kept for clarity)
  void width;
  void height;
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

/** Heuristic: pick a reasonable cell size from an image aspect ratio + terminal box. */
export function suggestCellSize(
  imgWidth: number,
  imgHeight: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  // Each cell is 1×2 image pixels (W×H), so terminal aspect is roughly 1:2 per cell.
  // We want cols/rows such that cols == k * imgWidth and 2*rows == k * imgHeight.
  // → rows/cols = imgHeight / (2 * imgWidth)
  const rowsPerCol = imgHeight / (2 * imgWidth);
  let cols = maxCols;
  let rows = Math.round(cols * rowsPerCol);
  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.round(rows / rowsPerCol);
  }
  return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

/** Load image and pick sensible cell dims given a max box. */
export async function loadImageAuto(
  filePath: string,
  maxCols: number,
  maxRows: number,
  options: LoadImageOptions = {},
): Promise<Pixel[][]> {
  const probe = await Jimp.read(filePath);
  const { cols, rows } = suggestCellSize(
    probe.bitmap.width,
    probe.bitmap.height,
    maxCols,
    maxRows,
  );
  return loadImageAsGrid(filePath, cols, rows, options);
}

export function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|gif|bmp|tiff?|webp)$/i.test(p);
}
