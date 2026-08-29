import { useRef } from "react";

// How long a press must be held before it counts as a long-press (a normal tap
// is far shorter, so it fires `onTap` without ever arming `onLongPress`).
const LONG_PRESS_MS = 400;

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
    // A scroll/gesture that steals the pointer cancels it — don't fire the
    // long-press (mobile: a drag over the row must not open the mode menu).
    onPointerCancel: clearTimer,
    onClick: () => {
      if (armed.current) {
        armed.current = false;
        return;
      }
      onTap();
    },
  };
}
