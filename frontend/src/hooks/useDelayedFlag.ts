import { useEffect, useState } from "react";

/**
 * Returns true only after `active` has been continuously true for `delayMs`.
 * Flipping `active` to false resets immediately. Used to gate loading
 * indicators so fast operations never flash one on screen.
 */
export function useDelayedFlag(active: boolean, delayMs = 400): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);

  return shown;
}
