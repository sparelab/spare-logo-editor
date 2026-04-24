import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { useDispatch, useStore } from '../state/store.js';
import { parseAnsi } from '../io/parser.js';
import { isImagePath, loadImageAuto } from '../io/image.js';
import { LEFT_PANEL_WIDTH } from './LeftPanel.js';

const MAX_VISIBLE = 14;

type Entry = { name: string; isDir: boolean };

function isRoot(p: string): boolean {
  // dirname is its own fixed point only at the filesystem root.
  return dirname(p) === p;
}

function listDir(cwd: string): Entry[] {
  const entries: Entry[] = [];
  // No `..` at the filesystem root — there's nowhere to go up to.
  if (!isRoot(cwd)) entries.push({ name: '..', isDir: true });
  let items: string[] = [];
  try {
    items = readdirSync(cwd);
  } catch {
    return entries;
  }
  for (const name of items) {
    try {
      const st = statSync(join(cwd, name));
      const isDir = st.isDirectory();
      if (isDir || isImagePath(name) || /\.txt$/i.test(name)) {
        entries.push({ name, isDir });
      }
    } catch {}
  }
  entries.sort((a, b) => {
    if (a.name === '..') return -1;
    if (b.name === '..') return 1;
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export function FilePicker() {
  const state = useStore();
  const dispatch = useDispatch();
  const { columns } = useWindowSize();
  const active = state.prompt?.kind === 'openFile';
  const [cwd, setCwd] = useState<string>(() => process.cwd());
  const [entries, setEntries] = useState<Entry[]>(() => listDir(process.cwd()));
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refresh listing whenever cwd changes.
  useEffect(() => {
    setEntries(listDir(cwd));
    setIndex(0);
    setError(null);
  }, [cwd]);

  // Reset to current process cwd each time the picker opens.
  useEffect(() => {
    if (active) {
      setCwd(process.cwd());
      setError(null);
    }
  }, [active]);

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.escape) {
        dispatch({ type: 'CLOSE_PROMPT' });
        return;
      }
      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) => Math.min(entries.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.leftArrow) {
        // Shortcut: jump straight to the parent directory.
        const parent = dirname(cwd);
        if (parent && parent !== cwd) setCwd(parent);
        return;
      }
      // Type a letter/digit → jump to next entry whose name starts with it
      // (case-insensitive). Wraps if no match below the cursor.
      if (input && input.length === 1 && /[\w.]/.test(input) && !key.ctrl && !key.meta) {
        const ch = input.toLowerCase();
        const findFrom = (from: number) => {
          for (let i = 0; i < entries.length; i++) {
            const j = (from + i) % entries.length;
            if (entries[j]!.name.toLowerCase().startsWith(ch)) return j;
          }
          return -1;
        };
        const found = findFrom(index + 1);
        if (found !== -1) setIndex(found);
        return;
      }
      if (key.return) {
        const safeI = entries.length === 0
          ? 0
          : Math.max(0, Math.min(entries.length - 1, index));
        const e = entries[safeI];
        if (!e) return;
        const path = resolve(cwd, e.name);
        if (e.isDir) {
          setCwd(path);
          return;
        }
        try {
          if (isImagePath(path)) {
            // Async image decode + downsample. Don't keep the source path —
            // saving must go to a fresh .txt to avoid clobbering the binary.
            (async () => {
              const cols = Math.max(
                1,
                (process.stdout.columns ?? 80) - LEFT_PANEL_WIDTH,
              );
              const rows = Math.max(1, (process.stdout.rows ?? 24) - 1);
              const grid = await loadImageAuto(path, cols, rows);
              dispatch({
                type: 'LOAD_GRID',
                grid,
                filePath: null,
                imageSource: path,
              });
              dispatch({
                type: 'SET_STATUS',
                status: `imported ${path}`,
              });
              dispatch({ type: 'CLOSE_PROMPT' });
            })().catch((err) =>
              setError(`open failed: ${(err as Error).message}`),
            );
          } else {
            const text = readFileSync(path, 'utf8');
            const grid = parseAnsi(text);
            dispatch({ type: 'LOAD_GRID', grid, filePath: path });
            dispatch({ type: 'SET_STATUS', status: `opened ${path}` });
            dispatch({ type: 'CLOSE_PROMPT' });
          }
        } catch (err) {
          setError(`open failed: ${(err as Error).message}`);
        }
        return;
      }
    },
    { isActive: active },
  );

  if (!active) return null;

  // Defensive clamp: entries can change between an input event and the
  // re-render that consumes it, so make sure the highlight always points
  // at a real row.
  const safeIndex = entries.length === 0
    ? 0
    : Math.max(0, Math.min(entries.length - 1, index));

  // Sliding window so the selection stays visible.
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, entries.length - MAX_VISIBLE),
      safeIndex - Math.floor(MAX_VISIBLE / 2),
    ),
  );
  const visible = entries.slice(start, start + MAX_VISIBLE);

  // Width inside the border + paddingX — used to pad each row so the
  // selection highlight spans the full line and each row renders as a
  // solid block (avoids inline-collapse artifacts that ink sometimes
  // produces with bare Text siblings in a column flex).
  const inner = Math.max(1, columns - 4);
  const pad = (s: string) =>
    s.length >= inner ? s.slice(0, inner) : s.padEnd(inner, ' ');

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      paddingX={1}
      width={columns}
    >
      <Text bold>{pad('Open')}</Text>
      <Text dimColor>{pad(cwd)}</Text>
      {visible.map((e, i) => {
        const realIdx = start + i;
        const sel = realIdx === safeIndex;
        const label = e.isDir ? `${e.name}/` : e.name;
        return (
          <Text
            key={e.name}
            color={sel ? 'black' : e.isDir ? 'cyan' : undefined}
            backgroundColor={sel ? 'cyan' : undefined}
          >
            {pad(` ${label}`)}
          </Text>
        );
      })}
      {entries.length > MAX_VISIBLE && (
        <Text dimColor>{pad(`${safeIndex + 1}/${entries.length}`)}</Text>
      )}
      {error && <Text color="red">{pad(error)}</Text>}
      <Text dimColor>
        {pad('↑↓ navigate • Enter open • ← / Backspace parent • Esc cancel')}
      </Text>
    </Box>
  );
}
