import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

import type { RollResult, RollSpec } from "@/lib/dice";
import DiceRoller from "@/features/dice/DiceRoller";
import type { DiceRollerProps } from "@/features/dice/diceRollerTypes";

// Beat between one set settling and the next tumble starting, so results
// don't blur together. Long enough to register a total, short enough that a
// full unskipped sequence of 6 stays around 6 * (750ms tumble + 400ms) ~ 6.9s.
const STEP_PAUSE_MS = 400;

interface DiceRollSequenceProps {
  /** What each step rolls, e.g. `{ count: 4, faces: 6, dropLowest: 1 }`. */
  spec: RollSpec;
  /** How many times to roll `spec`, one step at a time. */
  count: number;
  /** Bump this (e.g. a counter) to start a fresh sequence. Leave undefined to
   *  stay idle on mount — e.g. while only showing a previously-restored roll. */
  triggerKey?: number | string;
  /** Totals to paint into the result boxes while idle (`stepIndex === -1`) —
   *  e.g. a pool restored from a saved draft on page load. Ignored once a
   *  real roll starts or has results of its own; never feeds `onComplete`. */
  restoredTotals?: number[];
  /** Called once all `count` steps have settled, with their results in order. */
  onComplete: (results: RollResult[]) => void;
  /** Which roller component drives each step — `DiceRoller` (a predetermined
   *  result animating into place) or `PhysicsDiceRoller` (a genuine physics
   *  throw the result is read from). Defaults to `DiceRoller`. The two share
   *  an identical prop contract (`diceRollerTypes.ts`), so this orchestrator
   *  doesn't otherwise need to know or care which one it's driving. */
  roller?: ComponentType<DiceRollerProps>;
  className?: string;
}

/**
 * Rolls `count` repeats of the same `RollSpec` one at a time instead of all
 * at once — six simultaneous 4d6 sets (character creation's original take)
 * read as "a lot" in practice, and revealing each total in turn is calmer to
 * follow. Reuses whichever `roller` component actually rolls (it + the
 * dice-result logic it's built on stay the sole source of randomness/
 * results) — this is purely an orchestrator: which step is live, what's been
 * collected, and a one-click "Skip" that resolves the current and all
 * remaining steps instantly.
 */
export default function DiceRollSequence({
  spec,
  count,
  triggerKey,
  restoredTotals,
  onComplete,
  roller: Roller = DiceRoller,
  className = "",
}: DiceRollSequenceProps) {
  // -1 = idle/not started, 0..count-1 = the live step, count = done.
  const [stepIndex, setStepIndex] = useState(-1);
  const [results, setResults] = useState<RollResult[]>([]);
  const [skip, setSkip] = useState(false);

  const lastTriggerRef = useRef<number | string | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pauseTimerRef = useRef<number | undefined>(undefined);
  const completedRef = useRef(false);

  // Same StrictMode-safe shape as DiceRoller's own trigger effect: owns its
  // cleanup here rather than in a separate effect, so a dev-only double
  // mount/unmount/remount can't leave a stale pause timer or a dedupe ref
  // that skips the real re-trigger. Deliberately depends on [triggerKey]
  // only — `stepIndex` is read once per trigger to guard the very first
  // run, not to react to the step-by-step advances the effect below drives
  // directly; subscribing to it here would re-run this effect (and its
  // cleanup, which rewinds `lastTriggerRef`) on every step and the sequence
  // would never progress past step 0.
  useEffect(() => {
    if (triggerKey === undefined) return undefined;
    if (lastTriggerRef.current === triggerKey && stepIndex !== -1) return undefined;
    const previousTrigger = lastTriggerRef.current;
    lastTriggerRef.current = triggerKey;
    setResults([]);
    setSkip(false); // must reset, or every future sequence resolves instantly
    completedRef.current = false;
    setStepIndex(0);
    return () => {
      lastTriggerRef.current = previousTrigger;
      if (pauseTimerRef.current !== undefined) clearTimeout(pauseTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  // Advancing the sequence is a side effect of a step settling (notify the
  // parent, or move to the next step after a pause) — it has to live in an
  // effect, not in the `setResults` updater passed to handleStepResult.
  // Calling onComplete (which triggers the parent's own setState) from
  // inside a setState updater fires while React is still processing this
  // component's render, which is exactly what trips "Cannot update a
  // component while rendering a different component."
  useEffect(() => {
    if (results.length === 0) return undefined;

    if (results.length >= count) {
      // Guard against StrictMode's double-invoke calling onComplete twice
      // for the same finished sequence.
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current(results);
      }
      setStepIndex(count);
      return undefined;
    }

    if (skip) {
      setStepIndex(results.length); // cascade instantly, no pause
      return undefined;
    }

    pauseTimerRef.current = window.setTimeout(() => setStepIndex(results.length), STEP_PAUSE_MS);
    return () => {
      if (pauseTimerRef.current !== undefined) clearTimeout(pauseTimerRef.current);
    };
  }, [results, count, skip]);

  function handleStepResult(result: RollResult) {
    setResults((previous) => [...previous, result]);
  }

  const inProgress = stepIndex >= 0 && stepIndex < count;
  // Once done, keep showing the last step's Roller frozen on its
  // settled result instead of unmounting it — same key as it had while
  // live, so React reuses that instance rather than remounting (and
  // re-rolling) it. This, plus reserving the Skip line below even when
  // it's not clickable, means nothing about this panel's height changes
  // between "just finished" and "fully idle again" — the only previous
  // residual shift left after the rolling-phase fix above.
  const displayStepIndex = stepIndex < 0 ? -1 : Math.min(stepIndex, count - 1);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Fixed-size slots, all rendered from the first render — filling one
          in only swaps its content, so this row's size never changes as
          results arrive (no layout shift below it). aria-hidden because each
          step's own Roller already announces its result via its aria-live
          region; six of those used to fire at once and race, one per step in
          order is already an improvement on its own. */}
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, index) => {
          // Idle with nothing rolled yet this mount: paint from a restored
          // pool (e.g. the draft reloaded from localStorage) instead of "–",
          // so the boxes read correctly before the player ever re-rolls.
          const showRestored = stepIndex === -1 && results.length === 0 && restoredTotals;
          const filled = showRestored ? index < restoredTotals.length : Boolean(results[index]);
          const total = showRestored ? restoredTotals[index] : results[index]?.total;
          // The most-recently-settled total: each chip flips into this state
          // exactly once as its result lands, retriggering the pop animation.
          // Restored totals appear all at once on mount, not one at a time,
          // so they never get the pop treatment.
          const justAdded = !showRestored && filled && index === results.length - 1;
          return (
            <span
              key={index}
              className={`inline-flex h-8 w-10 items-center justify-center rounded-control border font-display text-sm tabular-nums ${
                filled
                  ? "border-arcane-400 bg-arcane-50 text-arcane-800"
                  : "border-parchment-300 bg-parchment-50 text-parchment-800"
              } ${justAdded ? "animate-[score-pop_0.45s_ease-out]" : ""}`}
            >
              {filled ? total : "–"}
            </span>
          );
        })}
      </div>

      {/* Reserve the die-stage slot even when idle so the panel's height
          doesn't change as the sequence starts. A single Roller instance is
          kept mounted across all steps (no per-step `key` remount) so the dice
          stay on screen and re-roll in place — `rollKey` changing per step is
          what triggers each fresh roll. */}
      <div className="h-44 w-full">
        {displayStepIndex >= 0 && (
          <Roller
            spec={spec}
            rollKey={`${triggerKey}:${displayStepIndex}`}
            skip={skip}
            showTotal={false}
            onResult={handleStepResult}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setSkip(true)}
        aria-hidden={!inProgress}
        disabled={!inProgress}
        className={`self-start text-xs font-semibold text-garnet-700 hover:underline ${
          inProgress ? "" : "invisible"
        }`}
      >
        Skip
      </button>
    </div>
  );
}
