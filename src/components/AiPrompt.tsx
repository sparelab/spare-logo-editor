import React, { type ReactNode } from 'react';
import { Box, Text, useInput, usePaste, useWindowSize } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { generateImage } from '../io/genx.js';
import { loadImageAuto } from '../io/image.js';
import { getKey, setKey } from '../io/keystore.js';
import { log } from '../utils/log.js';
import { useCanvasBounds } from '../app.js';

const KEY_URL = 'https://genx.sh/keys';

/**
 * Render a clickable URL using OSC 8 hyperlink escapes (iTerm2, kitty,
 * mintty, modern xterm). Terminals that don't support OSC 8 ignore the
 * escapes and just display the visible text.
 */
function Link({ url, children }: { url: string; children?: ReactNode }) {
  const visible = children ?? url;
  const start = `\x1b]8;;${url}\x1b\\`;
  const end = `\x1b]8;;\x1b\\`;
  return (
    <Text>
      {start}
      <Text underline color="cyan">{visible}</Text>
      {end}
    </Text>
  );
}

/**
 * After ink strips a leading ESC, unrecognized control sequences (notably
 * SGR mouse events like `\x1b[<0;10;5M`) arrive as multi-character "input"
 * strings and would otherwise type themselves into our text fields. Detect
 * the obvious shapes and ignore.
 */
function isControlSequenceGarbage(s: string): boolean {
  if (s.length <= 1) return false;
  // SGR mouse: `[<button;x;y;[Mm]` or `[<…M\x1b[…m` (down + release together)
  if (/^\[<\d+;\d+;\d+[Mm]/.test(s)) return true;
  // CSI sequences in general: "[" then params then a final byte
  if (/^\[[\d;<>?]*[A-Za-z~]/.test(s)) return true;
  // SS3 sequences (function keys): "O" + final byte
  if (/^O[A-Za-z]/.test(s)) return true;
  return false;
}

/**
 * Modal that drives the GenX flow. Two states:
 *   - kind: 'aiPrompt' — text input for the image description
 *   - kind: 'apiKey'   — input for the API key, with a link to where to get one
 *
 * Submitting the prompt POSTs to GenX, polls until the image is ready,
 * downloads it, then imports it via the same path as drag-and-drop.
 * If the user has no saved key when they submit, we transparently bounce
 * them through the key prompt and resume.
 */
/** Show only the tail of `s` so a long value never wraps off the input row. */
function windowed(s: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  return s.length > maxWidth ? s.slice(s.length - maxWidth) : s;
}

export function AiPrompt() {
  const state = useStore();
  const dispatch = useDispatch();
  const { maxCols, maxRows } = useCanvasBounds();
  const { columns } = useWindowSize();

  const isAi = state.prompt?.kind === 'aiPrompt';
  const isKey = state.prompt?.kind === 'apiKey';
  const value =
    state.prompt?.kind === 'aiPrompt' || state.prompt?.kind === 'apiKey'
      ? state.prompt.value
      : '';

  const submitAi = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) {
      dispatch({ type: 'CLOSE_PROMPT' });
      return;
    }
    let apiKey = getKey();
    if (!apiKey) {
      // Save the prompt context: we'll re-open the AI prompt with the same
      // text after the user enters their key.
      dispatch({ type: 'OPEN_API_KEY_PROMPT' });
      dispatch({
        type: 'SET_STATUS',
        status: `paste your GenX key (get one at ${KEY_URL})`,
      });
      pendingPrompt = prompt;
      return;
    }
    dispatch({ type: 'CLOSE_PROMPT' });
    dispatch({ type: 'SET_GENERATING', value: true });
    dispatch({ type: 'SET_STATUS', status: 'submitting…' });
    try {
      const { file, chromaKey } = await generateImage({
        apiKey,
        prompt,
        onStatus: (msg) =>
          dispatch({ type: 'SET_STATUS', status: `genx: ${msg}` }),
      });
      // Strip the chroma-key background the model was asked to paint. The
      // exact colour depends on the prompt (e.g. switches to purple if the
      // user wants a green subject), so use whatever generateImage returned.
      const grid = await loadImageAuto(file, maxCols, maxRows, {
        chromaKey,
      });
      dispatch({
        type: 'LOAD_GRID',
        grid,
        filePath: null,
        imageSource: file,
        imageChromaKey: chromaKey,
      });
      dispatch({ type: 'SET_STATUS', status: `imported (orig: ${file})` });
    } catch (err) {
      log('genx flow failed', (err as Error).message);
      dispatch({
        type: 'SET_STATUS',
        status: `genx failed: ${(err as Error).message}`,
      });
    } finally {
      dispatch({ type: 'SET_GENERATING', value: false });
    }
  };

  const submitKey = (raw: string) => {
    const k = raw.trim();
    if (!k) {
      dispatch({ type: 'CLOSE_PROMPT' });
      return;
    }
    try {
      setKey(k);
      dispatch({ type: 'SET_STATUS', status: 'GenX key saved' });
    } catch (err) {
      dispatch({
        type: 'SET_STATUS',
        status: `key save failed: ${(err as Error).message}`,
      });
      return;
    }
    // If we got here from a generate attempt, resume with the original prompt.
    if (pendingPrompt) {
      const p = pendingPrompt;
      pendingPrompt = null;
      dispatch({ type: 'OPEN_AI_PROMPT', initial: p });
    } else {
      dispatch({ type: 'CLOSE_PROMPT' });
    }
  };

  useInput(
    (input, key) => {
      if (!isAi && !isKey) return;
      if (key.escape) {
        if (isKey) pendingPrompt = null;
        dispatch({ type: 'CLOSE_PROMPT' });
        return;
      }
      if (key.return) {
        if (isAi) submitAi(value);
        else if (isKey) submitKey(value);
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({
          type: 'UPDATE_PROMPT_VALUE',
          value: value.slice(0, -1),
        });
        return;
      }
      if (input && !key.ctrl && !key.meta && !isControlSequenceGarbage(input)) {
        dispatch({ type: 'UPDATE_PROMPT_VALUE', value: value + input });
      }
    },
    { isActive: isAi || isKey },
  );

  // Bracketed-paste mode delivers pastes via usePaste, NOT useInput. Without
  // this hook, ⌘V into the key field would silently drop on the floor.
  usePaste(
    (text) => {
      // Strip wrapping CR/LF and surrounding whitespace; collapse newlines so
      // a multi-line clipboard doesn't break the field.
      const cleaned = text.replace(/[\r\n]+/g, '').trim();
      if (!cleaned) return;
      dispatch({ type: 'UPDATE_PROMPT_VALUE', value: value + cleaned });
    },
    { isActive: isAi || isKey },
  );

  // Reserve a few cols for the modal border + padding + label, so the
  // visible value never overflows the row and shoves the next line down.
  const innerWidth = Math.max(10, columns - 4);

  if (isAi) {
    const label = 'AI prompt: ';
    const visible = windowed(value, Math.max(1, innerWidth - label.length - 1));
    return (
      <Box
        borderStyle="single"
        paddingX={1}
        flexDirection="column"
        width={columns}
      >
        <Box width="100%">
          <Text bold>{label}</Text>
          <Text>{visible}</Text>
          <Text inverse> </Text>
        </Box>
        <Box width="100%">
          <Text dimColor>Enter to generate · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }
  if (isKey) {
    const label = 'Paste here: ';
    const masked = maskedValue(value);
    const visible = windowed(masked, Math.max(1, innerWidth - label.length - 1));
    return (
      <Box
        borderStyle="single"
        paddingX={1}
        flexDirection="column"
        width={columns}
      >
        <Box width="100%">
          <Text bold>GenX API key needed</Text>
        </Box>
        <Box width="100%">
          <Text dimColor>Get one at </Text>
          <Link url={KEY_URL} />
          <Text dimColor> (saved to ~/.spare-logo-editor/key)</Text>
        </Box>
        <Box width="100%" marginTop={1}>
          <Text bold>{label}</Text>
          <Text>{visible}</Text>
          <Text inverse> </Text>
        </Box>
        <Box width="100%">
          <Text dimColor>Enter to save · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }
  return null;
}

/** Holds an in-flight prompt while the user enters their key. */
let pendingPrompt: string | null = null;

/** Show only the last 4 chars of the key as the user types, for shoulder-surfing safety. */
function maskedValue(v: string): string {
  if (v.length <= 4) return v;
  return '*'.repeat(v.length - 4) + v.slice(-4);
}
