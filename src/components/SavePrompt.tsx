import React from 'react';
import { Box, Text, useInput } from 'ink';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { useDispatch, useStore } from '../state/store.js';
import { serializeGrid } from '../io/serializer.js';

/** Expand a leading `~` (or `~/...`) to the user's home dir. */
function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export function saveToPath(
  path: string,
  state: ReturnType<typeof useStore>,
  dispatch: ReturnType<typeof useDispatch>,
): boolean {
  try {
    const abs = resolve(expandTilde(path));
    // Create the parent dir on demand so users can save into a fresh folder
    // without manually mkdir'ing first.
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, serializeGrid(state.grid), 'utf8');
    dispatch({ type: 'SET_FILE', filePath: abs });
    dispatch({ type: 'MARK_CLEAN' });
    dispatch({ type: 'SET_STATUS', status: `saved ${abs}` });
    return true;
  } catch (err) {
    dispatch({
      type: 'SET_STATUS',
      status: `save failed: ${(err as Error).message}`,
    });
    return false;
  }
}

export function SavePrompt() {
  const state = useStore();
  const dispatch = useDispatch();
  const active = state.prompt?.kind === 'savePath';

  const prompt = state.prompt?.kind === 'savePath' ? state.prompt : null;

  useInput(
    (input, key) => {
      if (!prompt) return;
      if (key.escape) {
        dispatch({ type: 'CLOSE_PROMPT' });
        return;
      }
      if (key.return) {
        const path = prompt.value.trim();
        if (!path) {
          dispatch({ type: 'CLOSE_PROMPT' });
          return;
        }
        if (saveToPath(path, state, dispatch)) {
          dispatch({ type: 'CLOSE_PROMPT' });
        }
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({
          type: 'UPDATE_PROMPT_VALUE',
          value: prompt.value.slice(0, -1),
        });
        return;
      }
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        // Don't accept multi-char garbage from unhandled escape sequences
        // (notably SGR mouse events like `[<0;10;5M`).
        !(input.length > 1 && /^[\[O]/.test(input))
      ) {
        dispatch({
          type: 'UPDATE_PROMPT_VALUE',
          value: prompt.value + input,
        });
      }
    },
    { isActive: active },
  );

  if (!prompt) return null;
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text bold>Save as: </Text>
      <Text>{prompt.value}</Text>
      <Text inverse> </Text>
      <Text dimColor>  Enter to save · Esc to cancel · ~ and absolute paths ok</Text>
    </Box>
  );
}
