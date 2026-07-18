// The ceremony's adaptive step rail (#886): numbered dots joined by rules,
// reflecting whatever steps the served plan contains. Presentational only —
// state comes from railState.

import { Check } from "lucide-react";

import { railState, stepKey, stepLabel, type LevelUpStepState } from "@/lib/levelUpSteps";
import type { LevelUpStep } from "@/types/character";

const DOT_STYLE: Record<LevelUpStepState, string> = {
  done: "border-vitality-600 bg-vitality-600 text-parchment-50",
  active: "border-garnet-700 bg-garnet-700 text-parchment-50",
  pending: "border-parchment-300 bg-parchment-50 text-parchment-400",
};

const NAME_STYLE: Record<LevelUpStepState, string> = {
  done: "text-parchment-500",
  active: "text-garnet-800",
  pending: "text-parchment-500",
};

export default function StepRail({ steps, currentKey }: { steps: LevelUpStep[]; currentKey: string }) {
  const states = railState(steps, currentKey);
  return (
    <ol className="flex flex-wrap items-center justify-center gap-y-2">
      {steps.map((step, i) => {
        const state = states[i];
        return (
          <li
            key={stepKey(step)}
            aria-label={`Step ${i + 1}: ${stepLabel(step)}`}
            aria-current={state === "active" ? "step" : undefined}
            className="flex items-center"
          >
            {i > 0 && <span aria-hidden className="mx-2 h-px w-5 bg-parchment-300 md:w-8" />}
            <span
              aria-hidden
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${DOT_STYLE[state]}`}
            >
              {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            {/* Names collapse below md — the dots alone carry the rail on phones. */}
            <span aria-hidden className={`ml-2 hidden text-xs font-semibold md:inline ${NAME_STYLE[state]}`}>
              {stepLabel(step)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
