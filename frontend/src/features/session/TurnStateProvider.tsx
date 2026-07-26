/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
/**
 * The single turn-state instance for the sheet workspace (#959).
 *
 * `useTurnState` must be called EXACTLY ONCE per mounted tree — two instances
 * would both hydrate from the same `cs:turn:<sessionId>` localStorage key and
 * silently diverge (last write wins via the persistence effect). So the one
 * instance lives here, in an always-mounted provider, and every other surface
 * (the Combat panel, the live strip, the nav pip, the round selector) reads it
 * via `useTurnStateContext()`.
 *
 * Always mounted — never wrap the sheet in it conditionally, or a live↔static
 * flip would remount every panel. The context VALUE is null unless a session is
 * live and joined; callers branch on that.
 */

import { createContext, useContext, type ReactNode } from "react";

import { useCombatPoll } from "@/features/session/useCombatPoll";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnState, type TurnStateView } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

const TurnStateContext = createContext<TurnStateView | null>(null);

interface Props {
  children: ReactNode;
}

export function TurnStateProvider({ children }: Props) {
  const { character } = useCurrentCharacter();
  const { status, sessionId } = useLiveSession();
  const joined = status === "liveJoined";
  const view = useTurnState(character, joined ? sessionId : null);

  // #1030: keep round/combatActive current across polls without re-fetching
  // the whole tracker. `active` gates on `joined` (see useCombatPoll's
  // why-comment) — not on `view.inCombat` — so a remote combat START is
  // still detected. `view` is non-null whenever `joined` is true (useTurnState's
  // own contract), so the syncCombat call below is always reachable when it fires.
  // Plain arrow, not useCallback: `view` is a fresh `{ ...state, ... }` object
  // every render, so the memo never stayed stable anyway — useCombatPoll
  // already reads this through a ref on every tick, so nothing is gained by
  // memoizing it here.
  const onSync = (round: number, combatActive: boolean, updatedAt: string) =>
    view?.syncCombat(round, combatActive, updatedAt);
  useCombatPoll(character.id, sessionId, joined, onSync);

  return <TurnStateContext.Provider value={view}>{children}</TurnStateContext.Provider>;
}

/** Null when there is no live joined session — callers branch on it. */
export function useTurnStateContext(): TurnStateView | null {
  return useContext(TurnStateContext);
}
