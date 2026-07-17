import { useRef } from "react";

// How long a press must be held before it counts as a long-press (a normal tap
// is far shorter, so it fires `onTap` without ever arming `onLongPress`).
const LONG_PRESS_MS = 400;

/**
 * Distinguish a tap from a press-and-hold on a pointer target (#958). `onTap`
 * fires on a normal click; `onLongPress` fires once the hold passes the
 * threshold, and the trailing click that follows a hold is swallowed so it
 * doesn't also fire `onTap`. Spread the returned handlers onto the element.
 */
export function useLongPress(onTap: () => void, onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  // Set once the long-press fires so the trailing click is ignored.
  const armed = useRef(false);

  function clearTimer() {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }

  return {
    onPointerDown: () => {
      armed.current = false;
      timer.current = window.setTimeout(() => {
        armed.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: clearTimer,
    onPointerLeave: clearTimer,
    onClick: () => {
      if (armed.current) {
        armed.current = false;
        return;
      }
      onTap();
    },
  };
}
