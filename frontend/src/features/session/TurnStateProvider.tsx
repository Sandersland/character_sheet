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

import { useCombatPoll, type CombatRefresh } from "@/features/session/useCombatPoll";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnState, type TurnStateView } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SpellEconomyState } from "@/types/character";

/**
 * The turn state plus a manual combat resync (#1439) — `refreshCombat` pulls the
 * server-resolved bonus-action interlock right after a cast, so the block shows
 * without waiting for the ~5s poll. It lives on the context (not the reducer,
 * which can't fetch) so the resolution sheet can trigger it via one read.
 */
export type TurnStateContextValue = TurnStateView & { refreshCombat: CombatRefresh };

const TurnStateContext = createContext<TurnStateContextValue | null>(null);

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
  // memoizing it here. The synced `spellEconomy` (#1439) is the server-resolved
  // bonus-action interlock, rebroadcast into the reducer alongside round.
  const onSync = (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) =>
    view?.syncCombat(round, combatActive, updatedAt, spellEconomy);
  const refreshCombat = useCombatPoll(character.id, sessionId, joined, onSync);

  const value = view ? { ...view, refreshCombat } : null;
  return <TurnStateContext.Provider value={value}>{children}</TurnStateContext.Provider>;
}

/** Null when there is no live joined session — callers branch on it. */
export function useTurnStateContext(): TurnStateContextValue | null {
  return useContext(TurnStateContext);
}
