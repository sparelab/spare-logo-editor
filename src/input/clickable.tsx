import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { DOMElement } from 'ink';

export type ClickButton = 'left' | 'right' | 'middle' | 'none';

export type ClickModifiers = {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
};

export type ClickPayload = {
  /** terminal x, 1-based */
  x: number;
  /** terminal y, 1-based */
  y: number;
  /** x relative to the clickable's top-left, 0-based */
  localX: number;
  /** y relative to the clickable's top-left, 0-based */
  localY: number;
  button: ClickButton;
  modifiers: ClickModifiers;
};

export type ClickHandlers = {
  onDown?: (ev: ClickPayload) => void;
  onDrag?: (ev: ClickPayload) => void;
  onUp?: (ev: ClickPayload) => void;
  onMove?: (ev: ClickPayload) => void;
};

type Bounds = { left: number; top: number; width: number; height: number };

type Region = {
  id: string;
  getBounds: () => Bounds | null;
  handlers: ClickHandlers;
};

type ActiveDrag = {
  region: Region;
  bounds: Bounds;
  button: ClickButton;
  modifiers: ClickModifiers;
};

type ClickCtx = {
  register: (region: Region) => void;
  unregister: (id: string) => void;
  /**
   * Route a mouse event into the registered regions.
   * Returns true if consumed.
   */
  dispatch: (
    kind: 'down' | 'drag' | 'up' | 'move',
    x: number,
    y: number,
    button: ClickButton,
    modifiers: ClickModifiers,
  ) => boolean;
};

const Ctx = createContext<ClickCtx | null>(null);

function inBounds(x: number, y: number, b: Bounds): boolean {
  // Yoga coords are 0-based, terminal mouse coords are 1-based.
  return (
    x >= b.left + 1 &&
    x < b.left + 1 + b.width &&
    y >= b.top + 1 &&
    y < b.top + 1 + b.height
  );
}

function payload(
  x: number,
  y: number,
  b: Bounds,
  button: ClickButton,
  modifiers: ClickModifiers,
): ClickPayload {
  return {
    x,
    y,
    localX: x - (b.left + 1),
    localY: y - (b.top + 1),
    button,
    modifiers,
  };
}

export function ClickableProvider({ children }: { children: ReactNode }) {
  const regionsRef = useRef<Map<string, Region>>(new Map());
  const activeRef = useRef<ActiveDrag | null>(null);

  const ctx = useMemo<ClickCtx>(
    () => ({
      register(region) {
        regionsRef.current.set(region.id, region);
      },
      unregister(id) {
        regionsRef.current.delete(id);
        if (activeRef.current?.region.id === id) activeRef.current = null;
      },
      dispatch(kind, x, y, button, modifiers) {
        if (kind === 'down') {
          // Iterate in reverse insertion order so nested/later regions win.
          const entries = [...regionsRef.current.values()].reverse();
          for (const r of entries) {
            const b = r.getBounds();
            if (!b) continue;
            if (inBounds(x, y, b)) {
              activeRef.current = { region: r, bounds: b, button, modifiers };
              r.handlers.onDown?.(payload(x, y, b, button, modifiers));
              return true;
            }
          }
          return false;
        }
        if (kind === 'drag') {
          const a = activeRef.current;
          if (!a) return false;
          // Re-measure each drag tick — bounds may shift if layout changes.
          const b = a.region.getBounds() ?? a.bounds;
          a.bounds = b;
          // Drag events from terminals don't always include modifier bits;
          // carry the modifiers from the original down event so handlers see
          // a consistent gesture.
          a.region.handlers.onDrag?.(payload(x, y, b, a.button, a.modifiers));
          return true;
        }
        if (kind === 'up') {
          const a = activeRef.current;
          if (!a) return false;
          const b = a.region.getBounds() ?? a.bounds;
          a.region.handlers.onUp?.(payload(x, y, b, a.button, a.modifiers));
          activeRef.current = null;
          return true;
        }
        if (kind === 'move') {
          const entries = [...regionsRef.current.values()].reverse();
          for (const r of entries) {
            const b = r.getBounds();
            if (!b) continue;
            if (inBounds(x, y, b)) {
              r.handlers.onMove?.(payload(x, y, b, button, modifiers));
              return true;
            }
          }
          return false;
        }
        return false;
      },
    }),
    [],
  );

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useClickContext(): ClickCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useClickContext outside ClickableProvider');
  return v;
}

/** Walk yoga node up to root summing computed offsets → absolute bounds. */
export function absoluteBoundsOf(node: DOMElement | null): Bounds | null {
  if (!node || !node.yogaNode) return null;
  const yn: any = node.yogaNode;
  const width = yn.getComputedWidth?.() ?? 0;
  const height = yn.getComputedHeight?.() ?? 0;
  let left = yn.getComputedLeft?.() ?? 0;
  let top = yn.getComputedTop?.() ?? 0;
  let cur: any = node.parentNode;
  while (cur) {
    const cy: any = cur.yogaNode;
    if (cy) {
      left += cy.getComputedLeft?.() ?? 0;
      top += cy.getComputedTop?.() ?? 0;
    }
    cur = cur.parentNode;
  }
  return { left, top, width, height };
}

/**
 * Returns a ref to attach to an `<Box ref={...}>` (or `<Text ref={...}>`).
 * The element registers as a hit-test target with the nearest ClickableProvider.
 */
export function useClickable(
  handlers: ClickHandlers,
): React.RefObject<DOMElement | null> {
  const ref = useRef<DOMElement | null>(null);
  const ctx = useClickContext();
  const id = useId();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    ctx.register({
      id,
      getBounds: () => absoluteBoundsOf(ref.current),
      handlers: {
        onDown: (e) => handlersRef.current.onDown?.(e),
        onDrag: (e) => handlersRef.current.onDrag?.(e),
        onUp: (e) => handlersRef.current.onUp?.(e),
        onMove: (e) => handlersRef.current.onMove?.(e),
      },
    });
    return () => ctx.unregister(id);
  }, [ctx, id]);

  return ref;
}
