/* eslint-disable react-refresh/only-export-components */
/**
 * Sheet-scoped roll context: a single `RollProvider` at the `CharacterSheetPage`
 * level gives every child component access to `useRoll()`. Rolling calls the
 * pure `rollSpec` engine from `@/lib/dice` (no 3D animation — same fast-roll
 * pattern as SpellsSection and ResourcePoolRow), then publishes the result so
 * `RollResultToast` can display it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { rollSpec, type RollResult, type RollSpec } from "@/lib/dice";

export interface RollEntry {
  /** Monotonically-increasing id so useEffect can detect a re-roll of the
   *  same spec (same id means no new roll; different id means trigger toast). */
  id: number;
  /** Human-readable label, e.g. "Perception check", "Longsword damage (slashing)". */
  label: string;
  result: RollResult;
}

interface RollContextValue {
  lastRoll: RollEntry | null;
  /** Roll the spec, publish the result to `RollResultToast`, and return it. */
  roll: (spec: RollSpec, label: string) => RollResult;
}

const RollContext = createContext<RollContextValue | null>(null);

/** Mount once at `CharacterSheetPage` level to enable `useRoll` in all children. */
export function RollProvider({ children }: { children: ReactNode }) {
  const [lastRoll, setLastRoll] = useState<RollEntry | null>(null);
  const idRef = useRef(0);

  const roll = useCallback((spec: RollSpec, label: string): RollResult => {
    const result = rollSpec(spec);
    setLastRoll({ id: ++idRef.current, label, result });
    return result;
  }, []);

  return (
    <RollContext.Provider value={{ lastRoll, roll }}>
      {children}
    </RollContext.Provider>
  );
}

/** Access the roll function and last result. Must be used inside `RollProvider`. */
export function useRoll(): RollContextValue {
  const ctx = useContext(RollContext);
  if (!ctx) throw new Error("useRoll must be used inside <RollProvider>");
  return ctx;
}
