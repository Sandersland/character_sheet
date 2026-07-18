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

import { useLiveSession } from "@/features/session/LiveSessionProvider";
import { useTurnState, type TurnStateView } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

const TurnStateContext = createContext<TurnStateView | null>(null);

interface Props {
  character: Character;
  children: ReactNode;
}

export function TurnStateProvider({ character, children }: Props) {
  const { status, sessionId } = useLiveSession();
  const view = useTurnState(character, status === "liveJoined" ? sessionId : null);
  return <TurnStateContext.Provider value={view}>{children}</TurnStateContext.Provider>;
}

/** Null when there is no live joined session — callers branch on it. */
export function useTurnStateContext(): TurnStateView | null {
  return useContext(TurnStateContext);
}
