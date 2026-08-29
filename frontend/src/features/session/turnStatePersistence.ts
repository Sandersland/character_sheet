// Key per session: cs:turn:<sessionId> — all operations are guarded with try/catch so a corrupted or missing entry degrades gracefully to initialState() without crashing the page; stale-schema snapshots are backfilled at the hydration site by merging over initialState().

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
