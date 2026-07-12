/**
 * localStorage persistence helpers for turn/combat state.
 *
 * Key per session: `cs:turn:<sessionId>` — JSON-encoded TurnState.
 * All operations are guarded with try/catch so a corrupted or missing
 * localStorage entry degrades gracefully to `initialState()` without
 * crashing the page. Stale-schema snapshots (an older shape missing a newer
 * field) are backfilled at the hydration site by merging over `initialState()`.
 */

import type { TurnState } from "@/features/session/useTurnState";

function storageKey(sessionId: string) {
  return `cs:turn:${sessionId}`;
}

export function loadTurnState(sessionId: string): TurnState | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as TurnState;
  } catch {
    return null;
  }
}

export function saveTurnState(sessionId: string, state: TurnState): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(state));
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

export function clearTurnState(sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    // Silently ignore.
  }
}
