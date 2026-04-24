#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from './app.js';
import { StoreProvider } from './state/store.js';
import { parseAnsi } from './io/parser.js';
import { isImagePath, loadImageAuto } from './io/image.js';
import { LEFT_PANEL_WIDTH } from './components/LeftPanel.js';
import { log, LOG_FILE } from './utils/log.js';
import type { Pixel } from './state/types.js';

const cli = meow(
  `
  Usage
    $ spare-logo-editor [file]

    file may be:
      • an existing .txt with ANSI escapes (round-trip editable)
      • a raster image (.png/.jpg/.gif/.bmp/.tiff/.webp) — converted to a
        Pixel grid sized to fit the terminal; you'll need to "Save as" to
        write it out as .txt

  Mouse paints; left panel selects color & target.
  `,
  {
    importMeta: import.meta,
    flags: {},
  },
);

log('---- launch ----', { argv: cli.input, log: LOG_FILE });
const file = cli.input[0] ? resolve(cli.input[0]) : null;

// Initial canvas size = terminal minus left panel + status bar (1 row).
const cols = Math.max(1, (process.stdout.columns ?? 80) - LEFT_PANEL_WIDTH);
const rows = Math.max(1, (process.stdout.rows ?? 24) - 1);

let initialGrid: Pixel[][] | undefined;
let initialFilePath: string | null = file;
let initialImageSource: string | null = null;
if (file && existsSync(file)) {
  if (isImagePath(file)) {
    // Imported PNG/JPG: don't reuse the source path on save (would overwrite
    // the binary image with ANSI text). Remember the source so resize can
    // re-decode at higher quality until the user starts painting.
    initialGrid = await loadImageAuto(file, cols, rows);
    initialFilePath = null;
    initialImageSource = file;
  } else {
    const text = readFileSync(file, 'utf8');
    initialGrid = parseAnsi(text);
  }
}

const CLEAR = '\x1b[2J\x1b[H';

// Clear before mounting so the alternate-screen buffer starts blank.
process.stdout.write(CLEAR);

const clearOnExit = () => {
  try {
    process.stdout.write(CLEAR);
  } catch {}
};
process.once('exit', clearOnExit);
process.once('SIGINT', clearOnExit);
process.once('SIGTERM', clearOnExit);

const instance = render(
  <StoreProvider
    rows={initialGrid?.length ?? rows}
    cols={initialGrid?.[0]?.length ?? cols}
    initialGrid={initialGrid}
    initialFilePath={initialFilePath}
    initialImageSource={initialImageSource}
  >
    <App />
  </StoreProvider>,
  { alternateScreen: true },
);

// Also clear when the app exits cleanly (e.g. user presses 'q').
instance.waitUntilExit().then(clearOnExit, clearOnExit);
