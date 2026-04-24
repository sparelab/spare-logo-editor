import { describe, expect, test } from 'bun:test';
import { parseMouseChunk } from '../src/input/mouse.ts';

describe('SGR mouse parser', () => {
  test('left button press + release', () => {
    const ev = parseMouseChunk('\x1b[<0;10;5M\x1b[<0;10;5m');
    expect(ev).toEqual([
      {
        kind: 'down',
        button: 'left',
        x: 10,
        y: 5,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      {
        kind: 'up',
        button: 'left',
        x: 10,
        y: 5,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
  });

  test('shift + left click sets shift modifier', () => {
    // SGR code 4 = left (0) | shift (4)
    const ev = parseMouseChunk('\x1b[<4;10;5M');
    expect(ev[0]!.modifiers.shift).toBe(true);
    expect(ev[0]!.button).toBe('left');
    expect(ev[0]!.kind).toBe('down');
  });

  test('right click', () => {
    const ev = parseMouseChunk('\x1b[<2;3;7M');
    expect(ev).toEqual([
      {
        kind: 'down',
        button: 'right',
        x: 3,
        y: 7,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
  });

  test('left drag (motion + button)', () => {
    const ev = parseMouseChunk('\x1b[<32;10;5M');
    expect(ev).toEqual([
      {
        kind: 'drag',
        button: 'left',
        x: 10,
        y: 5,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
  });

  test('move with no button (35)', () => {
    const ev = parseMouseChunk('\x1b[<35;42;9M');
    expect(ev).toEqual([
      {
        kind: 'move',
        button: 'none',
        x: 42,
        y: 9,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
  });

  test('multiple events in one chunk', () => {
    const ev = parseMouseChunk(
      '\x1b[<0;1;1M\x1b[<32;2;1M\x1b[<32;3;1M\x1b[<0;3;1m',
    );
    expect(ev.length).toBe(4);
    expect(ev[0]!.kind).toBe('down');
    expect(ev[1]!.kind).toBe('drag');
    expect(ev[3]!.kind).toBe('up');
  });
});
