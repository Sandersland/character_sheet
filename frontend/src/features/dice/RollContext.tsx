/* eslint-disable react-refresh/only-export-components */
/**
 * Sheet-scoped roll context: a single `RollProvider` at the `CharacterSheetPage`
 * / `SessionPage` level gives every child component access to `useRoll()`.
 *
 * Roll mode is strictly per-roll (#958): the roll surface pins `spec.mode` (the
 * skill/save long-press menu or the attack sheet's own ADV/DIS control), else a
 * roll is Normal. Two roll paths:
 * - `roll(spec, label)` — instant fast-roll (no 3D), used by the in-combat
 *   attack/damage/spell pickers which run their own logging.
 * - `rollAnimated(spec, label, log?)` — the sheet's skill/ability/save/
 *   initiative affordances. Honors the Dice-rolls preference (#945): `animated`
 *   plays the 3D `DiceRollModal` which, at settle, hands off to the shared
 *   `RollResultSeal`; `quick` publishes the same seal instantly. Both log the
 *   roll (when `log` is set and a session is active) via `logRoll` and hand the
 *   settled result to `onSettled`.
 *
 * `logSessionRoll` is the shared best-effort logging path — a no-op outside an
 * active session — used by `rollAnimated` and directly by the concentration-save
 * modal so every player-driven roll reaches the Session Log the same way.
 */

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

import { logRoll } from "@/api/client";
import {
  formatRollSpec,
  rollSpec,
  type RollMode,
  type RollResult,
  type RollSpec,
} from "@/lib/dice";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import type { RollModifier } from "@/types/character";

// Lazy so the 3D dice stack (three/@react-three/cannon-es) stays out of the
// initial chunk — it loads only when a roll actually animates.
const DiceRollModal = lazy(() => import("@/features/dice/DiceRollModal"));

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
interface RollLogInput extends RollLog {
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
  /** Player-driven roll honoring the Dice-rolls pref: animated → 3D modal,
   *  quick → compact chip. Logs the roll when in a session; `onSettled` fires
   *  with the settled result so a caller can apply the exact shown roll
   *  server-side (e.g. forwarding a consumable's effect dice). */
  rollAnimated: (spec: RollSpec, label: string, log?: RollLog, onSettled?: (result: RollResult) => void) => void;
  /** Best-effort session-log emit — no-op outside an active session. */
  logSessionRoll: (input: RollLogInput) => void;
  /** State-driven advantage/disadvantage grants (#486) for resolveRollMode. */
  rollModifiers: RollModifier[];
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
  /** State-driven advantage/disadvantage grants (#486); resolved per roll by consumers. */
  rollModifiers?: RollModifier[];
}

/** A roll awaiting its 3D tumble (null when no overlay is open). */
interface PendingRoll {
  id: number;
  spec: RollSpec;
  label: string;
  log?: RollLog;
  onSettled?: (result: RollResult) => void;
}

/**
 * The best-effort session-logging concern, split out of `RollProvider`: mirrors
 * the live session identity into a ref and returns a stable `logSessionRoll`
 * that no-ops unless both a character and an active session exist.
 */
function useSessionRollLog({
  characterId,
  sessionId,
  onRollLogged,
}: Pick<RollProviderProps, "characterId" | "sessionId" | "onRollLogged">) {
  const sessionRef = useRef({ characterId, sessionId, onRollLogged });
  sessionRef.current = { characterId, sessionId, onRollLogged };

  return useCallback((input: RollLogInput) => {
    const { characterId: cid, sessionId: sid, onRollLogged: onLogged } = sessionRef.current;
    if (!cid || !sid) return;
    logRoll(cid, sid, input)
      .then(() => onLogged?.())
      .catch((e) => console.error("roll log failed", e));
  }, []);
}

/** Mount once at page level to enable `useRoll` in all children. */
export function RollProvider({ children, characterId, sessionId, onRollLogged, rollModifiers = [] }: RollProviderProps) {
  const [lastRoll, setLastRoll] = useState<RollEntry | null>(null);
  const [pending, setPending] = useState<PendingRoll | null>(null);
  const idRef = useRef(0);
  // Dice-roll presentation preference (#945): `quick` skips the 3D overlay.
  const { style } = useDiceRollStyle();
  const styleRef = useRef(style);
  styleRef.current = style;
  // Mirror `pending` in a ref so handleResult's side effects stay OUT of the
  // setPending updater — updaters must be pure, and StrictMode double-invokes
  // them, which would otherwise double-fire logSessionRoll (#473 review).
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const logSessionRoll = useSessionRollLog({ characterId, sessionId, onRollLogged });

  // Roll mode is strictly per-roll now (#958): a caller pins `spec.mode` (from
  // the roll surface's own ADV/DIS control), else the roll is Normal.
  const roll = useCallback((spec: RollSpec, label: string): RollResult => {
    const result = rollSpec({ ...spec, mode: spec.mode ?? "normal" });
    setLastRoll({ id: ++idRef.current, label, result });
    return result;
  }, []);

  // Emit the session-log event for a settled roll, when a log payload is set.
  const logResult = useCallback(
    (spec: RollSpec, log: RollLog | undefined, result: RollResult) => {
      if (!log) return;
      logSessionRoll({
        ...log,
        total: result.total,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
        specLabel: formatRollSpec(spec),
        rollMode: spec.mode,
      });
    },
    [logSessionRoll],
  );

  // Roll mode is per-roll (#958): the caller's `spec.mode` (from the roll
  // surface's ADV/DIS control) wins, else Normal. `animated` plays the 3D
  // overlay which settles into the seal; `quick` resolves instantly to the
  // seal. Both log and hand back the settled result identically.
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

  // Fired when the 3D overlay's die settles: log it, hand it back, then hand
  // off to the shared result seal. The animated tumble is the animation; the
  // seal is the payoff — publishing `lastRoll` here and unmounting the overlay
  // makes the 3D tray "settle into" the same seal the quick path lands on
  // (#956), one visual language instead of a modal-vs-toast split.
  const handleResult = useCallback((result: RollResult) => {
    const current = pendingRef.current;
    if (!current) return;
    logResult(current.spec, current.log, result);
    // Hand the settled roll back so the caller can apply the exact shown values.
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

/** Access the roll functions and last result. Must be used inside `RollProvider`. */
export function useRoll(): RollContextValue {
  const ctx = useContext(RollContext);
  if (!ctx) throw new Error("useRoll must be used inside <RollProvider>");
  return ctx;
}
