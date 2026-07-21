// The class-choice step at ceremony start (#1170, BG3-style): pick which class
// entry advances, or start a new one via multiclassing. New-class options are
// collapsed behind a "New class →" drill-in (#1209) so the common case (advance
// an existing class) isn't buried among every not-yet-owned reference class;
// ineligible new-class rows stay listed (disabled) inside the drill-in with
// their unmet prerequisite. Renders as its own CeremonyCard — this runs before
// a plan exists, so it can't use LevelUpStepContext.

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

function OptionRadio({
  option,
  isSelected,
  onSelect,
}: {
  option: ClassChoiceOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={option.name}
      disabled={!option.eligible}
      onClick={onSelect}
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
  const existingOptions = options.filter((o) => o.target.kind === "existing");
  const newOptions = options.filter((o) => o.target.kind === "new");

  const [selected, setSelected] = useState<LevelUpTarget | null>(
    () => options.find((o) => o.eligible && sameLevelUpTarget(initialTarget, o.target))?.target ?? null,
  );
  // A ?classId= deep link into a not-yet-owned class should land the player
  // straight inside the drill-in, even if that option turns out ineligible
  // (they still need to see *why*, not bounce back to the top view).
  const [view, setView] = useState<"top" | "new">(() => (initialTarget?.kind === "new" ? "new" : "top"));

  const visibleOptions = view === "top" ? existingOptions : newOptions;

  return (
    <CeremonyCard className="flex min-h-0 flex-1 flex-col px-5 py-7 sm:px-10">
      <div className="shrink-0 text-center">
        <h1 className="font-display text-2xl font-semibold text-garnet-800">Which class levels up?</h1>
        <p className="mt-1 text-sm text-parchment-600">
          Advance one of your classes, or start a new one if you qualify to multiclass.
        </p>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-parchment-200 pt-4">
        {view === "new" && (
          <button
            type="button"
            onClick={() => setView("top")}
            // Accessible name disambiguates from the "New class →" open button,
            // which shares the visible "Add a new class" wording (#1209 review).
            aria-label="Back to class selection"
            className="mb-3 text-sm font-semibold text-garnet-700 hover:text-garnet-800"
          >
            ← Add a new class
          </button>
        )}
        <div
          role="radiogroup"
          aria-label={view === "top" ? "Class to advance" : "New class to add"}
          className="grid gap-3 sm:grid-cols-2"
        >
          {visibleOptions.map((option) => (
            <OptionRadio
              key={optionKey(option.target)}
              option={option}
              isSelected={sameLevelUpTarget(selected, option.target)}
              onSelect={() => setSelected(option.target)}
            />
          ))}
        </div>
        {view === "top" && newOptions.length > 0 && (
          <button
            type="button"
            onClick={() => setView("new")}
            aria-label="Add a new class"
            className="mt-3 text-sm font-semibold text-garnet-700 hover:text-garnet-800"
          >
            New class →
          </button>
        )}
      </div>

      {/* onBack/onConfirm/confirmLabel/confirmClassName are inert here — isFirst
          && !isLast always renders the Cancel/Continue pair, never Back/Confirm.
          CeremonyFooterProps requires them for the ceremonies that do reach isLast. */}
      <CeremonyFooter
        isFirst
        isLast={false}
        onCancel={onCancel}
        onBack={() => {}}
        onContinue={() => selected && onContinue(selected)}
        // Gate on the selection's kind matching the visible view so Continue is
        // enabled only when the checked radio is actually on screen — a top-level
        // pick stays live if you peek into the drill-in and back out (#1209 review).
        canContinue={selected != null && (view === "top" ? selected.kind === "existing" : selected.kind === "new")}
        onConfirm={() => {}}
        confirmLabel=""
        confirmClassName=""
        submitting={false}
      />
    </CeremonyCard>
  );
}
