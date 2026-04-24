import { useCallback } from 'react';
import { usePaste } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { isImagePath, loadImageAuto } from '../io/image.js';
import { useCanvasBounds } from '../app.js';

/**
 * Drag-and-drop from Finder onto a terminal pastes the file's path. With
 * bracketed paste mode (which `usePaste` enables), the path arrives as a
 * single string. If it points to an image, we wipe the canvas and re-import
 * at terminal-fit dimensions.
 *
 * Different terminals format the dropped text slightly differently:
 *   • iTerm2/Terminal.app: bare absolute path, sometimes shell-escaped
 *     (e.g. `/Users/me/foo\ bar.png`).
 *   • Some emit `file:///Users/me/foo.png` URLs.
 *   • Multi-file drops paste several whitespace-separated paths — we take
 *     the first.
 */
export function DropImport() {
  const dispatch = useDispatch();
  const state = useStore();
  const { maxCols, maxRows } = useCanvasBounds();

  const onPaste = useCallback(
    (text: string) => {
      if (state.prompt) return; // a modal is open — ignore
      const path = parseDroppedPath(text);
      if (!path || !isImagePath(path)) return;
      (async () => {
        try {
          const grid = await loadImageAuto(path, maxCols, maxRows);
          dispatch({
            type: 'LOAD_GRID',
            grid,
            filePath: null,
            imageSource: path,
          });
          dispatch({ type: 'SET_STATUS', status: `imported ${path}` });
        } catch (err) {
          dispatch({
            type: 'SET_STATUS',
            status: `import failed: ${(err as Error).message}`,
          });
        }
      })();
    },
    [dispatch, state.prompt, maxCols, maxRows],
  );

  // Disable while a modal is open so the prompt's own paste handler wins
  // (otherwise both fire and the AI key field could be confused with a drop).
  usePaste(onPaste, { isActive: !state.prompt });
  return null;
}

/**
 * Pull the first plausible filesystem path out of a pasted blob.
 * Handles shell-escaped spaces, quoted paths, and `file://` URLs.
 */
export function parseDroppedPath(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Quoted path — find the matching closing quote.
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0];
    let end = -1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === q && s[i - 1] !== '\\') {
        end = i;
        break;
      }
    }
    if (end === -1) return null;
    const inner = s.slice(1, end);
    if (inner.startsWith('file://')) {
      try {
        return decodeURIComponent(inner.slice(7)) || null;
      } catch {
        return null;
      }
    }
    return inner || null;
  }

  // Bare file:// URL (no quoting): take up to first unescaped whitespace.
  if (s.startsWith('file://')) {
    const m = s.match(/^(\S+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]!.slice(7)) || null;
    } catch {
      return null;
    }
  }

  // Shell-escaped path: walk chars, treating \X as a single literal X and
  // stopping at the first unescaped whitespace (handles multi-file drops).
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length) {
      out += s[i + 1];
      i++;
      continue;
    }
    if (/\s/.test(ch)) break;
    out += ch;
  }
  return out || null;
}
