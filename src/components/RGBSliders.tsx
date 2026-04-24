import React from 'react';
import { Box, Text } from 'ink';
import type { Color } from '../state/types.js';
import { rgbToHex } from '../utils/ansi.js';
import { useClickable } from '../input/clickable.js';

const BAR_WIDTH = 16;

type Channel = 'r' | 'g' | 'b' | 'a';
type Cur = { r: number; g: number; b: number; a: number };

function ChannelBar({
  channel,
  value,
  current,
  onChange,
}: {
  channel: Channel;
  value: number;
  current: Cur;
  onChange: (next: Cur) => void;
}) {
  const setVal = (v: number) => {
    const clamped = Math.max(0, Math.min(255, v));
    onChange({ ...current, [channel]: clamped });
  };
  const barRef = useClickable({
    onDown: (ev) => {
      const local = Math.max(0, Math.min(BAR_WIDTH - 1, ev.localX));
      setVal(Math.round((local / (BAR_WIDTH - 1)) * 255));
    },
    onDrag: (ev) => {
      const local = Math.max(0, Math.min(BAR_WIDTH - 1, ev.localX));
      setVal(Math.round((local / (BAR_WIDTH - 1)) * 255));
    },
  });
  const letterRef = useClickable({ onDown: () => setVal(0) });
  const valueRef = useClickable({ onDown: () => setVal(255) });
  const filled = Math.round((value / 255) * BAR_WIDTH);
  const bar = '█'.repeat(filled).padEnd(BAR_WIDTH, '·');
  const color =
    channel === 'r' ? 'red'
    : channel === 'g' ? 'green'
    : channel === 'b' ? 'blue'
    : 'white';
  return (
    <Box>
      <Box ref={letterRef}>
        <Text color={color}>{channel.toUpperCase()}</Text>
      </Box>
      <Text> </Text>
      <Box ref={barRef}>
        <Text color={color}>{bar}</Text>
      </Box>
      <Text> </Text>
      <Box ref={valueRef}>
        <Text>{String(value).padStart(3)}</Text>
      </Box>
    </Box>
  );
}

export function RGBSliders({
  value,
  onChange,
  showHex = true,
}: {
  value: Color;
  onChange: (next: Color) => void;
  showHex?: boolean;
}) {
  const r = value?.mode === 'rgb' ? value.r : 255;
  const g = value?.mode === 'rgb' ? value.g : 255;
  const b = value?.mode === 'rgb' ? value.b : 255;
  const a = value?.mode === 'rgb' && value.a !== undefined ? value.a : 255;
  const cur: Cur = { r, g, b, a };
  const set = (next: Cur) => {
    if (next.a >= 255) {
      onChange({ mode: 'rgb', r: next.r, g: next.g, b: next.b });
    } else {
      onChange({ mode: 'rgb', r: next.r, g: next.g, b: next.b, a: next.a });
    }
  };
  return (
    <Box flexDirection="column">
      <ChannelBar channel="r" value={r} current={cur} onChange={set} />
      <ChannelBar channel="g" value={g} current={cur} onChange={set} />
      <ChannelBar channel="b" value={b} current={cur} onChange={set} />
      <ChannelBar channel="a" value={a} current={cur} onChange={set} />
      {showHex && <Text>Hex {rgbToHex(r, g, b)}</Text>}
    </Box>
  );
}
