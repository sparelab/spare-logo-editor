# spare-logo-editor

Terminal pixel-art editor for **SGR images** — `.txt` files with embedded ANSI
escapes that `cat` renders directly. Mouse-driven, INK + React + Bun.

```
$ spare-logo-editor demo.txt        # open / create an ANSI image
$ spare-logo-editor logo.png        # import a raster image, downsampled to fit
$ spare-logo-editor                 # blank canvas, 'g' to AI-generate a logo
```

---

## Install

### Homebrew (macOS / Linux)

```sh
brew tap sparelab/spare
brew install spare-logo-editor
```

The formula installs a precompiled standalone binary — no Node or Bun required.

### npm (any platform with Node ≥ 20)

```sh
npm install -g spare-logo-editor
spare-logo-editor
```

### Manual build (from source)

Requires **Bun ≥ 1.3** (`brew install oven-sh/bun/bun` or
`curl -fsSL https://bun.sh/install | bash`).

```sh
git clone https://github.com/sparelab/spare-logo-editor.git
cd spare-logo-editor
bun install

# Run from source (no build step needed):
bun run dev

# Or produce a single self-contained binary (~60 MB):
bun run compile
./dist/spare-logo-editor

# Or produce a node bundle (requires Node ≥ 20 to run):
bun run build
node dist/cli.js

# Cross-compile for every platform (matches what CI ships):
bun run release-build
ls dist/release/
```

---

## How a pixel works

Each terminal cell stores **two stacked pixels** rendered as `▀` (UPPER HALF
BLOCK). The character's foreground colour paints the top pixel, the background
colour paints the bottom. So an 80×40 cell grid is an 80×80 pixel image.

Two independent toggles in the sidebar — **Top** and **Bottom** — control which
halves of a cell receive the *foreground* color when you paint; disabled halves
get the *background* color.

| Top | Bottom | Result            |
|-----|--------|-------------------|
| on  | on     | full FG block     |
| on  | off    | FG over BG split  |
| off | on     | BG over FG split  |
| off | off    | full BG block     |

---

## Features

- **Mouse painting** — left-drag to paint, right-drag (or Shift+left-drag) to
  erase. Sidebar buttons are clickable too.
- **Foreground / Background RGBA pickers** — three-channel sliders plus alpha
  (consumed at paint time, since SGR can't carry it). Click the channel
  letter → set 0; click the bar → scrub; click the value → set 255.
- **Preview Background palette** — 16-step grayscale + 6 hue stops to preview
  the image against different terminal backgrounds (preview only, never saved).
- **Pixel preview** — single ▀ in the sidebar, exactly what `PAINT_CELL`
  produces with the current toggles + colors + test bg.
- **Resize** — independent W and H arrows in the sidebar (or arrow keys),
  capped to the visible canvas. **Shift + arrow** trims one row/column from
  the corresponding edge (lossless).
- **Undo** — `z` or Backspace. A whole drag-stroke collapses to one step.
- **Invert** image (`i`).
- **Pick** (`p`) — eyedropper. Next click on a cell sets FG = its top, BG =
  its bottom and disengages.
- **Open / Save / Save-as** — keyboard-driven file picker (`o`), supports
  `.txt` (round-trip) and `.png/.jpg/.gif/.bmp/.tiff/.webp` (decoded with
  `jimp`, downsampled to fit). Save-as accepts absolute paths, `~`, and
  auto-creates missing parent directories.
- **Drag-and-drop import** — drop an image from Finder onto the terminal and
  the canvas wipes + re-imports.
- **Sharpness slider** — re-decodes the imported source with an unsharp-mask
  pass. While the import is still pristine, every resize re-decodes from the
  original (avoiding stacked nearest-neighbor passes).
- **AI generation** — `g` opens a prompt; submission goes to GenX
  (`https://query.genx.sh`) using the **gpt-image-2** model, with a system
  prompt that asks for a CLI-friendly icon on a chroma-keyed background. The
  background is stripped (with despill for shadows) at import. The first time
  you generate, it asks for a key from <https://genx.sh/keys>; the key is
  saved to `~/.spare-logo-editor/key` (chmod 600).

---

## Hotkeys

| Key | Action |
|-----|--------|
| `t` | Toggle Top half |
| `b` | Toggle Bottom half |
| `i` | Invert image |
| `p` | Toggle Pick (eyedropper) |
| `o` | Open file picker |
| `s` | Save (or open Save-as if no path) |
| `g` | Open AI prompt |
| `z` / `Backspace` | Undo |
| `←` / `→` | Width −1 / +1 |
| `↓` / `↑` | Height −1 / +1 |
| `Shift + arrow` | Trim row/col from that edge |
| `Esc` | Cancel pick / close prompt |
| `q` | Quit |

---

## Save format

Plain `.txt` with embedded `\x1b[...]` escapes. Run-length compressed (only
emits SGR codes that change between cells). Cell character is chosen for flat
output:

- both halves transparent → `' '` (no fg colour bleed)
- top transparent → `▄` with bg=top
- bottom transparent → `▀` with bg=bottom
- both halves the same → `█`
- otherwise → `▀` with both fg + bg set

This means a transparent canvas displays *flat*, not as horizontal stripes.

---

## Releasing (maintainers)

The release flow is fully automated by `.github/workflows/release.yml`. To cut
a new version:

```sh
npm version patch    # bumps package.json + creates a v0.1.1 tag
git push --follow-tags
```

The workflow then:

1. Cross-compiles standalone Bun binaries for `darwin-arm64`, `darwin-x64`,
   `linux-arm64`, `linux-x64`.
2. Tarballs each binary, computes sha256, and attaches them to a GitHub
   Release.
3. Publishes the npm package (the JS bundle in `dist/cli.js`) under the same
   version.
4. Renders the Homebrew formula with the current version + sha256s and pushes
   it to `<owner>/homebrew-spare`.

Required repo secrets:

- `NPM_TOKEN` — npm automation token with publish rights for
  `spare-logo-editor`.
- `HOMEBREW_TAP_TOKEN` — GitHub PAT (or fine-grained token) with `contents:
  write` on `<owner>/homebrew-spare`.

---

## Tech

- **Bun** runtime + bundler (compiles to a single executable)
- **ink 7** (React 19 in the terminal)
- **jimp** for image decode (pure JS)
- **meow** for CLI parsing
- **TypeScript**, ESM, strict

### Project layout

```
src/
  cli.tsx                CLI entry, mounts <App/>
  app.tsx                Layout, hotkeys, useResize(), useCanvasBounds()
  state/
    types.ts             Color, Pixel, AppState, Action
    store.tsx            Reducer + Context + StoreProvider
  io/
    serializer.ts        Pixel[][] → ANSI text
    parser.ts            ANSI text → Pixel[][]
    image.ts             PNG/JPG → Pixel[][] (jimp + despill)
    genx.ts              GenX router client
    keystore.ts          ~/.spare-logo-editor/key
  input/
    mouse.ts             SGR mouse parser
    MouseRouter.tsx      Forwards mouse → click context
    clickable.tsx        useClickable() hit-test layer
    DropImport.tsx       Bracketed-paste handler for Finder drops
  components/
    LeftPanel.tsx        Sidebar
    AnimatedTitle.tsx    Multi-color title cycle
    TargetSelector.tsx   Top / Bottom toggles + pixel preview
    ColorPicker.tsx      Fg / Bg pickers + Invert + Pick buttons
    RGBSliders.tsx       Generic R/G/B/A sliders
    TestBgPicker.tsx     Preview Background palette
    Preview.tsx          Single-pixel composite preview
    ResizeControls.tsx   W / H arrows
    SharpnessSlider.tsx  Unsharp-mask amount
    AiButton.tsx         AI generate (animated busy state)
    Canvas.tsx           Drawable area
    StatusBar.tsx        Bottom bar
    SavePrompt.tsx       Save-as modal
    FilePicker.tsx       Open modal
    AiPrompt.tsx         AI prompt + API-key modal
  utils/
    ansi.ts              Color → escape, blendColors, despill, contrast
    log.ts               File logger → /tmp/spare-logo-editor.log
scripts/
  build.ts               bun build with stub-devtools plugin (npm bundle)
  compile.ts             bun build --compile (single binary; honors $TARGET, $OUTFILE)
  release-build.ts       Build all platform binaries → dist/release/
  stub-devtools.ts       Replaces ink's optional react-devtools-core import
.github/workflows/release.yml
```

---

## Limits / non-features

- No selection / copy-paste / shapes (line, rect, fill).
- No layers.
- No alpha persistence in the saved file — flat RGB is what SGR allows.
- No PNG export — the file format is text. Screenshot the rendered terminal.

---

## License

MIT
