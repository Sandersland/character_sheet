/* eslint-disable react-refresh/only-export-components */
/**
 * Sheet-scoped roll context: a single `RollProvider` at the `CharacterSheetPage`
 * / `SessionPage` level gives every child component access to `useRoll()`.
 *
 * Two roll paths share the same sticky advantage/disadvantage `mode`:
 * - `roll(spec, label)` — instant fast-roll (no 3D), used by the in-combat
 *   attack/damage/spell pickers which run their own logging.
 * - `rollAnimated(spec, label, log?)` — plays the 3D `DiceRollModal`, publishes
 *   the result to `RollResultToast`, and (when `log` is set and a session is
 *   active) emits the roll's category event via `logRoll`. This is what the
 *   sheet's skill/ability/save/initiative affordances use.
 *
 * `logSessionRoll` is the shared best-effort logging path — a no-op outside an
 * active session — used by `rollAnimated` and directly by the concentration-save
 * modal so every player-driven roll reaches the Session Log the same way.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { logRoll } from "@/api/client";
import {
  formatRollSpec,
  rollSpec,
  type RollMode,
  type RollResult,
  type RollSpec,
} from "@/lib/dice";
import DiceRollModal from "@/features/dice/DiceRollModal";

export interface RollEntry {
  /** Monotonically-increasing id so useEffect can detect a re-roll of the
   *  same spec (same id means no new roll; different id means trigger toast). */
  id: number;
  /** Human-readable label, e.g. "Perception check", "Longsword damage (slashing)". */
  label: string;
  result: RollResult;
}

/** Roll-category metadata for a player-driven d20 roll (skill/ability/save/initiative). */
export interface RollLog {
  kind: "check" | "save" | "initiative";
  /** Display text carried onto the event (e.g. "Perception check"). */
  source: string;
  /** Ability key for check/save rolls. */
  ability?: string;
  /** Skill key for check rolls. */
  skill?: string;
  /** Target difficulty class, when the roll is made against one. */
  dc?: number;
}

/** Full best-effort session-log payload — the result-derived fields on top of `RollLog`. */
export interface RollLogInput extends RollLog {
  total: number;
  /** Raw kept die faces (non-dropped) for the Session Log breakdown. */
  faces?: number[];
  specLabel?: string;
  rollMode?: RollMode;
}

interface RollContextValue {
  lastRoll: RollEntry | null;
  /** Instant fast-roll: publish to the toast and return the result. */
  roll: (spec: RollSpec, label: string) => RollResult;
  /** Play the 3D dice, publish to the toast, and log the roll when in a session. */
  rollAnimated: (spec: RollSpec, label: string, log?: RollLog) => void;
  /** Best-effort session-log emit — no-op outside an active session. */
  logSessionRoll: (input: RollLogInput) => void;
  /** Sticky manual advantage/disadvantage applied to eligible d20 rolls. */
  mode: RollMode;
  setMode: (mode: RollMode) => void;
}

const RollContext = createContext<RollContextValue | null>(null);

interface RollProviderProps {
  children: ReactNode;
  /** Owning character — required for `logSessionRoll` to emit. */
  characterId?: string;
  /** Active session id — rolls only log while this is set (like attack/damage). */
  sessionId?: string | null;
  /** Fired after a roll is logged so a Session Log view can refresh. */
  onRollLogged?: () => void;
}

/** Mount once at page level to enable `useRoll` in all children. */
export function RollProvider({ children, characterId, sessionId, onRollLogged }: RollProviderProps) {
  const [lastRoll, setLastRoll] = useState<RollEntry | null>(null);
  const [mode, setMode] = useState<RollMode>("normal");
  // The active animated roll awaiting its 3D tumble (null when no overlay is open).
  const [pending, setPending] = useState<{ id: number; spec: RollSpec; label: string; log?: RollLog } | null>(null);
  const idRef = useRef(0);
  // Read live values inside stable callbacks without re-creating them per change.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sessionRef = useRef({ characterId, sessionId, onRollLogged });
  sessionRef.current = { characterId, sessionId, onRollLogged };
  // Mirror `pending` in a ref so handleResult's side effects stay OUT of the
  // setPending updater — updaters must be pure, and StrictMode double-invokes
  // them, which would otherwise double-fire logSessionRoll (#473 review).
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Best-effort session log — no-op unless both a character and active session exist.
  const logSessionRoll = useCallback((input: RollLogInput) => {
    const { characterId: cid, sessionId: sid, onRollLogged: onLogged } = sessionRef.current;
    if (!cid || !sid) return;
    logRoll(cid, sid, input)
      .then(() => onLogged?.())
      .catch((e) => console.error("roll log failed", e));
  }, []);

  // Callers may pin a spec's own mode; otherwise the sticky toggle applies.
  const roll = useCallback((spec: RollSpec, label: string): RollResult => {
    const result = rollSpec({ ...spec, mode: spec.mode ?? modeRef.current });
    setLastRoll({ id: ++idRef.current, label, result });
    return result;
  }, []);

  // Open the 3D overlay for this spec, resolving the sticky mode up front so the
  // animation (and the logged rollMode) reflect advantage/disadvantage.
  const rollAnimated = useCallback((spec: RollSpec, label: string, log?: RollLog) => {
    const resolvedSpec = { ...spec, mode: spec.mode ?? modeRef.current };
    setPending({ id: ++idRef.current, spec: resolvedSpec, label, log });
  }, []);

  // Fired when the overlay's die settles: toast it, then log it if requested.
  const handleResult = useCallback((result: RollResult) => {
    const current = pendingRef.current;
    if (!current) return;
    setLastRoll({ id: current.id, label: current.label, result });
    if (current.log) {
      logSessionRoll({
        ...current.log,
        total: result.total,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
        specLabel: formatRollSpec(current.spec),
        rollMode: current.spec.mode,
      });
    }
  }, [logSessionRoll]);

  return (
    <RollContext.Provider value={{ lastRoll, roll, rollAnimated, logSessionRoll, mode, setMode }}>
      {children}
      {pending && (
        <DiceRollModal
          key={pending.id}
          spec={pending.spec}
          label={pending.label}
          onResult={handleResult}
          onClose={() => setPending(null)}
        />
      )}
    </RollContext.Provider>
  );
}

/** Access the roll functions and last result. Must be used inside `RollProvider`. */
export function useRoll(): RollContextValue {
  const ctx = useContext(RollContext);
  if (!ctx) throw new Error("useRoll must be used inside <RollProvider>");
  return ctx;
}
