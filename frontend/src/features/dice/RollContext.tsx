/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { logRollAction } from "@/api/client";
import {
  formatRollSpec,
  rollSpec,
  type RollMode,
  type RollResult,
  type RollSpec,
} from "@/lib/dice";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import type { RollModifier } from "@/types/character";

const DiceRollModal = lazy(() => import("@/features/dice/DiceRollModal"));

export interface RollEntry {
  id: number;
  label: string;
  result: RollResult;
}

export interface RollLog {
  kind: "check" | "save" | "initiative";
  source: string;
  ability?: string;
  skill?: string;
  dc?: number;
}

interface RollLogInput extends RollLog {
  total: number;
  faces?: number[];
  droppedFaces?: number[];
  specLabel?: string;
  rollMode?: RollMode;
}

interface RollContextValue {
  lastRoll: RollEntry | null;
  roll: (spec: RollSpec, label: string) => RollResult;
  rollAnimated: (spec: RollSpec, label: string, log?: RollLog, onSettled?: (result: RollResult) => void) => void;
  // No-op outside an active session.
  logSessionRoll: (input: RollLogInput) => void;
  rollModifiers: RollModifier[];
}

const RollContext = createContext<RollContextValue | null>(null);

interface RollProviderProps {
  children: ReactNode;
  // Required for logSessionRoll to emit.
  characterId?: string;
  // Rolls only log while this is set.
  sessionId?: string | null;
  onRollLogged?: () => void;
  rollModifiers?: RollModifier[];
}

// null when no overlay is open.
interface PendingRoll {
  id: number;
  spec: RollSpec;
  label: string;
  log?: RollLog;
  onSettled?: (result: RollResult) => void;
}

function useSessionRollLog({
  characterId,
  sessionId,
  onRollLogged,
}: Pick<RollProviderProps, "characterId" | "sessionId" | "onRollLogged">) {
  const sessionRef = useRef({ characterId, sessionId, onRollLogged });
  sessionRef.current = { characterId, sessionId, onRollLogged };

  return useCallback((input: RollLogInput) => {
    const { characterId: cid, sessionId: sid, onRollLogged: onLogged } = sessionRef.current;
    // The resolver derives sessionId from the active session; not passed in the payload.
    if (!cid || !sid) return;
    logRollAction(cid, input)
      .then(() => onLogged?.())
      .catch((e) => console.error("roll log failed", e));
  }, []);
}

// Mount once at page level to enable useRoll in all children.
export function RollProvider({ children, characterId, sessionId, onRollLogged, rollModifiers = [] }: RollProviderProps) {
  const [lastRoll, setLastRoll] = useState<RollEntry | null>(null);
  const [pending, setPending] = useState<PendingRoll | null>(null);
  const idRef = useRef(0);
  // quick skips the 3D overlay (#945).
  const { style } = useDiceRollStyle();
  const styleRef = useRef(style);
  styleRef.current = style;
  // Mirrored into a ref (not read in setPending's updater) because updaters must be
  // pure and StrictMode double-invokes them, which would double-fire logSessionRoll.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const logSessionRoll = useSessionRollLog({ characterId, sessionId, onRollLogged });

  const roll = useCallback((spec: RollSpec, label: string): RollResult => {
    const result = rollSpec({ ...spec, mode: spec.mode ?? "normal" });
    setLastRoll({ id: ++idRef.current, label, result });
    return result;
  }, []);

  const logResult = useCallback(
    (spec: RollSpec, log: RollLog | undefined, result: RollResult) => {
      if (!log) return;
      // Only included below when non-empty; an always-present empty array would be noise on the wire.
      const droppedFaces = result.dice.filter((d) => d.dropped).map((d) => d.value);
      logSessionRoll({
        ...log,
        total: result.total,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
        ...(droppedFaces.length > 0 ? { droppedFaces } : {}),
        specLabel: formatRollSpec(spec),
        rollMode: spec.mode,
      });
    },
    [logSessionRoll],
  );

  const rollAnimated = useCallback(
    (spec: RollSpec, label: string, log?: RollLog, onSettled?: (result: RollResult) => void) => {
      const resolvedSpec = { ...spec, mode: spec.mode ?? "normal" };
      if (styleRef.current === "quick") {
        const result = rollSpec(resolvedSpec);
        setLastRoll({ id: ++idRef.current, label, result });
        logResult(resolvedSpec, log, result);
        onSettled?.(result);
        return;
      }
      setPending({ id: ++idRef.current, spec: resolvedSpec, label, log, onSettled });
    },
    [logResult],
  );

  const handleResult = useCallback((result: RollResult) => {
    const current = pendingRef.current;
    if (!current) return;
    logResult(current.spec, current.log, result);
    current.onSettled?.(result);
    setLastRoll({ id: current.id, label: current.label, result });
    setPending(null);
  }, [logResult]);

  return (
    <RollContext.Provider value={{ lastRoll, roll, rollAnimated, logSessionRoll, rollModifiers }}>
      {children}
      {pending && (
        <Suspense fallback={null}>
          <DiceRollModal
            key={pending.id}
            spec={pending.spec}
            label={pending.label}
            onResult={handleResult}
            onClose={() => setPending(null)}
          />
        </Suspense>
      )}
    </RollContext.Provider>
  );
}

export function useRoll(): RollContextValue {
  const ctx = useContext(RollContext);
  if (!ctx) throw new Error("useRoll must be used inside <RollProvider>");
  return ctx;
}
