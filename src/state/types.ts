export type Color =
  | { mode: '256'; index: number }
  | { mode: 'rgb'; r: number; g: number; b: number; a?: number }
  | null;

export type Pixel = { top: Color; bottom: Color };

export type TestBg = Color;

export type AppState = {
  grid: Pixel[][];
  /**
   * Source-of-truth grid used for RESIZE_GRID. We always resample from this
   * (never from the current grid) so going W→W-1→W gets you back the same
   * pixels rather than a nearest-neighbor pass-through.
   */
  pristineGrid: Pixel[][];
  rows: number;
  cols: number;
  /** Color applied to the top half of a pixel (the "foreground" of the ▀ char). */
  fgColor: Color;
  /** Color applied to the bottom half of a pixel (the "background" of the ▀ char). */
  bgColor: Color;
  paintTop: boolean;
  paintBottom: boolean;
  testBg: TestBg;
  filePath: string | null;
  dirty: boolean;
  cursor: { x: number; y: number } | null;
  status: string | null;
  history: Pixel[][][];
  /** True between BEGIN_STROKE and the first paint that records its baseline. */
  strokeOpen: boolean;
  /** When true, the next canvas click samples colors instead of painting. */
  picking: boolean;
  /** Active modal, or null. */
  prompt:
    | { kind: 'savePath'; value: string }
    | { kind: 'openFile' }
    | { kind: 'aiPrompt'; value: string }
    | { kind: 'apiKey'; value: string }
    | null;
  /** True while an AI image generation is in flight. */
  generating: boolean;
  /**
   * Path to the imported PNG/JPG/etc, if the current grid was decoded from
   * one and hasn't been edited since. Resize operations check this and
   * re-decode the source at the new dimensions for higher quality. Cleared
   * the moment the user paints/erases/inverts.
   */
  imageSource: string | null;
  /**
   * Optional chroma-key colour to strip from imageSource decodes (e.g. the
   * #00FF77 background we ask GenX to use). Cleared with imageSource.
   */
  imageChromaKey: { r: number; g: number; b: number } | null;
  /** Unsharp-mask amount applied during image decode. 0 = off, 100 = strong. */
  sharpness: number;
};

export type Action =
  | { type: 'SET_FG_COLOR'; color: Color }
  | { type: 'SET_BG_COLOR'; color: Color }
  | { type: 'INVERT_IMAGE' }
  | { type: 'TOGGLE_PICKER' }
  | { type: 'PICK_PIXEL'; x: number; y: number }
  | { type: 'OPEN_SAVE_PROMPT'; initial?: string }
  | { type: 'OPEN_FILE_PICKER' }
  | { type: 'OPEN_AI_PROMPT'; initial?: string }
  | { type: 'OPEN_API_KEY_PROMPT' }
  | { type: 'UPDATE_PROMPT_VALUE'; value: string }
  | { type: 'CLOSE_PROMPT' }
  | { type: 'SET_GENERATING'; value: boolean }
  | { type: 'SET_SHARPNESS'; value: number }
  | { type: 'TOGGLE_PAINT_TOP' }
  | { type: 'TOGGLE_PAINT_BOTTOM' }
  | { type: 'SET_TEST_BG'; bg: TestBg }
  | { type: 'PAINT_CELL'; x: number; y: number }
  | { type: 'ERASE_CELL'; x: number; y: number }
  | {
      type: 'LOAD_GRID';
      grid: Pixel[][];
      filePath?: string | null;
      imageSource?: string | null;
      imageChromaKey?: { r: number; g: number; b: number } | null;
    }
  | { type: 'RESIZE_GRID'; rows: number; cols: number }
  /** Replace grid + pristine with a freshly-decoded image at new dims. */
  | { type: 'RESIZE_FROM_IMAGE'; grid: Pixel[][] }
  /** Lossless trim: drop one edge row/col from the current grid. */
  | { type: 'TRIM_GRID'; edge: 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'SET_FILE'; filePath: string | null }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_CURSOR'; cursor: { x: number; y: number } | null }
  | { type: 'SET_STATUS'; status: string | null }
  | { type: 'BEGIN_STROKE' }
  | { type: 'END_STROKE' }
  | { type: 'UNDO' };

export const blankPixel = (): Pixel => ({ top: null, bottom: null });

export function makeBlankGrid(rows: number, cols: number): Pixel[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => blankPixel()),
  );
}
