// The class-choice step at ceremony start (#1170, BG3-style): pick which class
// entry advances, or start a new one via multiclassing. Ineligible new-class
// rows stay listed (disabled) with their unmet prerequisite, replacing the
// retired AddClassPanel's inline dropdown. Renders as its own CeremonyCard —
// this runs before a plan exists, so it can't use LevelUpStepContext.

import { useState } from "react";

import { CeremonyCard, CeremonyFooter } from "@/features/ceremony/CeremonyShell";
import { sameLevelUpTarget, type ClassChoiceOption } from "@/lib/levelUpClassChoice";
import type { LevelUpTarget } from "@/types/character";

const CARD_BASE =
  "flex flex-col gap-1 rounded border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400";
const CARD_SELECTED = "border-garnet-600 bg-parchment-50 ring-2 ring-garnet-50";
const CARD_IDLE = "border-parchment-300 bg-parchment-50 hover:border-garnet-400";
const CARD_DISABLED = "cursor-not-allowed border-parchment-200 bg-parchment-100 opacity-60";

function optionKey(target: LevelUpTarget): string {
  return target.kind === "existing" ? `existing:${target.classEntryId}` : `new:${target.classId}`;
}

export default function ClassChoiceStep({
  options,
  initialTarget,
  onContinue,
  onCancel,
}: {
  options: ClassChoiceOption[];
  initialTarget: LevelUpTarget | null;
  onContinue: (target: LevelUpTarget) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<LevelUpTarget | null>(
    () => options.find((o) => o.eligible && sameLevelUpTarget(initialTarget, o.target))?.target ?? null,
  );

  return (
    <CeremonyCard className="flex min-h-0 flex-1 flex-col px-5 py-7 sm:px-10">
      <div className="shrink-0 text-center">
        <h1 className="font-display text-2xl font-semibold text-garnet-800">Which class levels up?</h1>
        <p className="mt-1 text-sm text-parchment-600">
          Advance one of your classes, or start a new one if you qualify to multiclass.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Class to advance"
        className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-parchment-200 pt-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const isSelected = sameLevelUpTarget(selected, option.target);
            return (
              <button
                key={optionKey(option.target)}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={option.name}
                disabled={!option.eligible}
                onClick={() => setSelected(option.target)}
                className={`${CARD_BASE} ${
                  !option.eligible ? CARD_DISABLED : isSelected ? CARD_SELECTED : CARD_IDLE
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold text-parchment-900">{option.name}</span>
                  <span
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                      isSelected ? "border-garnet-600 bg-garnet-600" : "border-parchment-400"
                    }`}
                  />
                </span>
                <span className="text-sm text-parchment-600">{option.levelLine}</span>
                {!option.eligible && option.requirement && (
                  <span className="text-xs font-semibold text-garnet-700">Requires {option.requirement}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <CeremonyFooter
        isFirst
        isLast={false}
        onCancel={onCancel}
        onBack={() => {}}
        onContinue={() => selected && onContinue(selected)}
        canContinue={selected != null}
        onConfirm={() => {}}
        confirmLabel=""
        confirmClassName=""
        submitting={false}
      />
    </CeremonyCard>
  );
}
