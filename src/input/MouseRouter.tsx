import { useCallback } from 'react';
import { useMouse, type MouseEvent } from './mouse.js';
import { useClickContext } from './clickable.js';

export function MouseRouter() {
  const click = useClickContext();
  const onMouse = useCallback(
    (ev: MouseEvent) => {
      click.dispatch(ev.kind, ev.x, ev.y, ev.button, ev.modifiers);
    },
    [click],
  );
  useMouse(onMouse);
  return null;
}
