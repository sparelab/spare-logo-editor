import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useDispatch, useStore } from '../state/store.js';
import { useClickable } from '../input/clickable.js';
import { getKey } from '../io/keystore.js';

const IDLE_LABEL = 'Generate logo';
const BUSY_LABEL = 'Generating..';
const TICK_MS = 300;

export function AiButton() {
  const { generating } = useStore();
  const dispatch = useDispatch();
  const ref = useClickable({
    onDown: () => {
      if (generating) return; // disabled while a generation is in flight
      if (!getKey()) {
        dispatch({ type: 'OPEN_API_KEY_PROMPT' });
        return;
      }
      dispatch({ type: 'OPEN_AI_PROMPT' });
    },
  });

  // Marching-letter highlight while generating: one letter is rendered bold
  // bright-white, the rest dim. Advances every TICK_MS and loops.
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!generating) {
      setActive(0);
      return;
    }
    const id = setInterval(() => {
      setActive((i) => (i + 1) % BUSY_LABEL.length);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [generating]);

  return (
    <Box>
      <Text bold>AI </Text>
      <Box ref={ref}>
        <Text backgroundColor={generating ? '#3a2a0a' : '#5a3a0a'}>
          {' '}
          {generating ? (
            <>
              {[...BUSY_LABEL].map((ch, i) =>
                i === active ? (
                  <Text key={i} bold color="whiteBright">
                    {ch}
                  </Text>
                ) : (
                  <Text key={i} dimColor color="white">
                    {ch}
                  </Text>
                ),
              )}
            </>
          ) : (
            <>
              <Text bold color="white">
                G
              </Text>
              enerate logo
            </>
          )}
          {' '}
        </Text>
      </Box>
    </Box>
  );
}
