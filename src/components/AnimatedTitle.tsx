import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

const PALETTE = [
  'cyan',
  'magenta',
  'yellow',
  'green',
  'red',
  'blue',
  'whiteBright',
] as const;
const TICK_MS = 500;
const DURATION_MS = 10_000;

/**
 * Per-letter colour cycle for the sidebar title. Cycles every 500ms for the
 * first 10s after launch, then settles on a stable colour. The animation is
 * a one-shot welcome — re-mounting (e.g. closing/opening the editor) starts
 * it again.
 */
export function AnimatedTitle({ text }: { text: string }) {
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= DURATION_MS) {
        clearInterval(id);
        setDone(true);
        return;
      }
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Text>
      {[...text].map((ch, i) => {
        const color = done
          ? 'cyan'
          : PALETTE[(tick + i) % PALETTE.length];
        return (
          <Text key={i} bold color={color}>
            {ch}
          </Text>
        );
      })}
    </Text>
  );
}
