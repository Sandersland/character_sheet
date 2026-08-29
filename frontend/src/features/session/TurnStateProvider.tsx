/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
// useTurnState must run exactly once per mounted tree, in an always-mounted provider — two instances or a conditional mount would diverge or remount every panel.

import { createContext, useContext, type ReactNode } from "react";

import { useCombatPoll, type CombatRefresh } from "@/features/session/useCombatPoll";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnState, type TurnStateView } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SpellEconomyState } from "@/types/character";

// refreshCombat pulls the server-resolved bonus-action interlock right after a cast, so the block shows without waiting for the poll.
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

  // Plain arrow, not useCallback: `view` is a fresh object every render, and useCombatPoll reads this through a ref on every tick, so nothing is gained by memoizing it.
  const onSync = (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) =>
    view?.syncCombat(round, combatActive, updatedAt, spellEconomy);
  const refreshCombat = useCombatPoll(character.id, sessionId, joined, onSync);

  const value = view ? { ...view, refreshCombat } : null;
  return <TurnStateContext.Provider value={value}>{children}</TurnStateContext.Provider>;
}

export function useTurnStateContext(): TurnStateContextValue | null {
  return useContext(TurnStateContext);
}
