import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

import type { RollResult, RollSpec } from "@/lib/dice";
import DiceRoller from "@/features/dice/DiceRoller";
import type { DiceRollerProps } from "@/features/dice/diceRollerTypes";

const STEP_PAUSE_MS = 400;

interface DiceRollSequenceProps {
  spec: RollSpec;
  count: number;
  triggerKey?: number | string;
  restoredTotals?: number[];
  onComplete: (results: RollResult[]) => void;
  /** DiceRoller and PhysicsDiceRoller both implement DiceRollerProps (diceRollerTypes.ts); defaults to DiceRoller. */
  roller?: ComponentType<DiceRollerProps>;
  className?: string;
}

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

  // StrictMode-safe: owns its own cleanup so a dev double-invoke re-triggers
  // correctly. Deps are [triggerKey] only — including stepIndex would re-run
  // this on every step and stall the sequence at step 0.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- StrictMode-safe sequence reset keyed on triggerKey; stepIndex is read only to guard the reset, so adding it would re-run this (and its rewinding cleanup) every step and stall the sequence at step 0; useEffectEvent (the sanctioned extraction) isn't in React 18.3.1 (#1056)
  }, [triggerKey]);

  // Must live in an effect, not in the setResults updater passed to
  // handleStepResult: calling onComplete from inside a state updater trips
  // React's "Cannot update a component while rendering a different component."
  useEffect(() => {
    if (results.length === 0) return undefined;

    if (results.length >= count) {
      // Guards against StrictMode calling onComplete twice for one finished sequence.
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current(results);
      }
      setStepIndex(count);
      return undefined;
    }

    if (skip) {
      setStepIndex(results.length);
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
  // Keeps the last step's Roller mounted (same key) after finishing instead
  // of unmounting it, so React reuses the instance rather than re-rolling it.
  const displayStepIndex = stepIndex < 0 ? -1 : Math.min(stepIndex, count - 1);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Fixed-size slots keep this row's height stable as results arrive.
          aria-hidden: each step's Roller already announces via its own aria-live region. */}
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, index) => {
          const showRestored = stepIndex === -1 && results.length === 0 && restoredTotals;
          const filled = showRestored ? index < restoredTotals.length : Boolean(results[index]);
          const total = showRestored ? restoredTotals[index] : results[index]?.total;
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

      {/* Reserves this slot's height even when idle. The Roller has no
          per-step `key`, so React reuses one instance across steps —
          `rollKey` changing is what re-triggers each roll. */}
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
