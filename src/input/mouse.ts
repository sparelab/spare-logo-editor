import { useEffect } from 'react';
import { useStdin, useStdout } from 'ink';

export type MouseButton = 'left' | 'right' | 'middle' | 'none';
export type MouseEventKind = 'down' | 'up' | 'drag' | 'move';

export type MouseModifiers = {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
};

export type MouseEvent = {
  kind: MouseEventKind;
  button: MouseButton;
  /** 1-based terminal column */
  x: number;
  /** 1-based terminal row */
  y: number;
  modifiers: MouseModifiers;
};

const ENABLE = '\x1b[?1000;1002;1006h';
const DISABLE = '\x1b[?1000;1002;1006l';

const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

export function parseMouseChunk(buf: string): MouseEvent[] {
  const events: MouseEvent[] = [];
  SGR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SGR_RE.exec(buf))) {
    const code = Number(m[1]);
    const x = Number(m[2]);
    const y = Number(m[3]);
    const release = m[4] === 'm';

    const isDrag = (code & 32) !== 0; // motion while button held
    const isMove = (code & 32) !== 0 && (code & 3) === 3; // motion no button
    const buttonBits = code & 3;
    let button: MouseButton;
    if (isMove) button = 'none';
    else if (buttonBits === 0) button = 'left';
    else if (buttonBits === 1) button = 'middle';
    else if (buttonBits === 2) button = 'right';
    else button = 'none';

    let kind: MouseEventKind;
    if (release) kind = 'up';
    else if (isMove) kind = 'move';
    else if (isDrag) kind = 'drag';
    else kind = 'down';

    const modifiers: MouseModifiers = {
      shift: (code & 4) !== 0,
      alt: (code & 8) !== 0,
      ctrl: (code & 16) !== 0,
    };

    events.push({ kind, button, x, y, modifiers });
  }
  return events;
}

export function useMouse(handler: (e: MouseEvent) => void): void {
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const { stdout } = useStdout();

  useEffect(() => {
    if (!isRawModeSupported) return;
    setRawMode(true);
    stdout.write(ENABLE);

    const onData = (data: Buffer) => {
      const s = data.toString('utf8');
      const events = parseMouseChunk(s);
      for (const ev of events) handler(ev);
    };
    stdin.on('data', onData);

    const cleanup = () => {
      try {
        stdout.write(DISABLE);
      } catch {}
    };
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    return () => {
      stdin.off('data', onData);
      cleanup();
      process.off('exit', cleanup);
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
    };
  }, [stdin, stdout, setRawMode, isRawModeSupported, handler]);
}
