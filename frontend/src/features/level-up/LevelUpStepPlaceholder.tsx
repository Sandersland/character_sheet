// Stand-in step body: #887–#891 replace these with the real choice UIs.

import { stepLabel } from "@/lib/levelUpSteps";
import type { LevelUpStep } from "@/types/character";

export default function LevelUpStepPlaceholder({ step }: { step: LevelUpStep }) {
  return (
    <div className="py-8 text-center">
      <h2 className="font-display text-xl font-semibold text-parchment-900">{stepLabel(step)}</h2>
      <p className="mt-1.5 text-sm text-parchment-600">
        The {stepLabel(step)} choice arrives in a later update — this ceremony can't complete it yet.
      </p>
    </div>
  );
}
