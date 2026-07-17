/**
 * Pure keyboard/model helpers for the Combat live Turn/Log tablist (#962).
 * Kept out of CombatLivePanel.tsx so the component file exports only a
 * component (react-refresh/HMR) and the keyboard contract stays unit-testable.
 */

export type LiveView = "turn" | "log";

const VIEW_ORDER: LiveView[] = ["turn", "log"];

/** WAI-ARIA tablist keyboard map: Arrow keys wrap, Home/End jump to the ends.
 *  Returns the tab to move focus to, or null for an unhandled key. */
export function nextTabForKey(key: string, current: LiveView): LiveView | null {
  const i = VIEW_ORDER.indexOf(current);
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return VIEW_ORDER[(i + 1) % VIEW_ORDER.length];
    case "ArrowLeft":
    case "ArrowUp":
      return VIEW_ORDER[(i - 1 + VIEW_ORDER.length) % VIEW_ORDER.length];
    case "Home":
      return VIEW_ORDER[0];
    case "End":
      return VIEW_ORDER[VIEW_ORDER.length - 1];
    default:
      return null;
  }
}
