import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { applyConditionTransactions } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import BottomSheet from "@/components/ui/BottomSheet";
import ConditionsSheetBody from "@/features/conditions/ConditionsSheetBody";
import RestButton from "@/features/hitpoints/RestButton";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { conditionLabel, EXHAUSTION_MAX } from "@/lib/conditions";
import type { ConditionsState } from "@/types/character";

const STEP =
  "flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-parchment-50 text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40";
// a11y: 44pt hit target wrapping a 32pt visual disc.
const STEP_MOBILE =
  "flex h-11 w-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40";
const STEP_DISC =
  "flex h-8 w-8 items-center justify-center rounded-full border border-parchment-300 bg-parchment-50 text-parchment-700";

interface UtilityViewProps {
  active: ConditionsState["active"];
  exhaustion: number;
  exhaustionBusy: boolean;
  conditionsLabel: string;
  onManage: () => void;
  onAdd: () => void;
  onStep: (next: number) => void;
}

export default function CombatUtilityStrip() {
  const { character } = useCurrentCharacter();
  // "add" opens the sheet with the condition picker already expanded; "manage" opens it as-is.
  const [sheet, setSheet] = useState<null | "manage" | "add">(null);
  const isBelowMd = useIsBelowMd();
  const { active, exhaustion } = character.conditions;

  // a11y: the accessible name must announce active conditions, not hide them behind a static "Manage conditions".
  const conditionsLabel =
    active.length > 0
      ? `Manage conditions: ${active.map((c) => conditionLabel(c.key)).join(", ")}`
      : "Manage conditions";

  // Must fire the same setExhaustion op ConditionsSheetBody uses, or exhaustion drifts out of sync between the two.
  const exhaustionMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (level: number) => applyConditionTransactions(character.id, [{ type: "setExhaustion", level }]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to update exhaustion.",
  });
  const exhaustionBusy = exhaustionMutation.isPending;

  async function stepExhaustion(next: number) {
    const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, next));
    if (clamped === exhaustion) return;
    try {
      await exhaustionMutation.mutateAsync(clamped);
    } catch {
      // best-effort, no UI surface here
    }
  }

  const viewProps: UtilityViewProps = {
    active,
    exhaustion,
    exhaustionBusy,
    conditionsLabel,
    onManage: () => setSheet("manage"),
    onAdd: () => setSheet("add"),
    onStep: stepExhaustion,
  };

  return (
    <>
      {isBelowMd ? <MobileUtilityRows {...viewProps} /> : <DesktopUtilityLine {...viewProps} />}
      {sheet && (
        <BottomSheet title="Conditions" onClose={() => setSheet(null)}>
          {/* key={sheet} forces a remount so AddConditionPanel's mount-only defaultAddOpen reflects the current mode. */}
          <ConditionsSheetBody key={sheet} defaultAddOpen={sheet === "add"} />
        </BottomSheet>
      )}
    </>
  );
}

function MobileUtilityRows({
  active,
  exhaustion,
  exhaustionBusy,
  conditionsLabel,
  onManage,
  onAdd,
  onStep,
}: UtilityViewProps) {
  return (
    <div className="bg-parchment-50">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Conditions
        </span>
        <button
          type="button"
          aria-label="Add condition"
          onClick={onAdd}
          className="rounded-control px-1.5 py-0.5 text-[13px] font-semibold text-garnet-700 transition-colors hover:bg-garnet-50"
        >
          + Add
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3">
        <button
          type="button"
          aria-label={conditionsLabel}
          onClick={onManage}
          className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-control text-left"
        >
          {active.length === 0 ? (
            <span className="text-sm text-parchment-500">none</span>
          ) : (
            active.map((entry) => (
              <span
                key={entry.key}
                className="inline-flex items-center rounded-control border border-garnet-200 bg-garnet-50 px-2 py-0.5 text-xs font-semibold text-garnet-800"
              >
                {conditionLabel(entry.key)}
              </span>
            ))
          )}
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Exhaustion
          </span>
          <button
            type="button"
            aria-label="Decrease exhaustion"
            disabled={exhaustionBusy || exhaustion <= 0}
            onClick={() => onStep(exhaustion - 1)}
            className={STEP_MOBILE}
          >
            <span className={STEP_DISC}>
              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </button>
          <span
            aria-live="polite"
            className="min-w-[1rem] text-center font-display text-base font-semibold tabular-nums text-parchment-900"
          >
            {exhaustion}
          </span>
          <button
            type="button"
            aria-label="Increase exhaustion"
            disabled={exhaustionBusy || exhaustion >= EXHAUSTION_MAX}
            onClick={() => onStep(exhaustion + 1)}
            className={STEP_MOBILE}
          >
            <span className={STEP_DISC}>
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      </div>

      <RestButton variant="row" />
    </div>
  );
}

function DesktopUtilityLine({
  active,
  exhaustion,
  exhaustionBusy,
  conditionsLabel,
  onManage,
  onAdd,
  onStep,
}: UtilityViewProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2 shadow-card">
      {/* Uses spans, not a <ul>, so this stays valid phrasing content inside a <button>. */}
      <button
        type="button"
        aria-label={conditionsLabel}
        onClick={onManage}
        className="group flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-control px-1 py-0.5 text-left transition-colors hover:bg-parchment-100"
      >
        <span className="shrink-0 font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Conditions
        </span>
        {active.length === 0 ? (
          <span className="text-sm text-parchment-500">none</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            {active.map((entry) => (
              <span
                key={entry.key}
                className="inline-flex items-center rounded-control border border-garnet-200 bg-garnet-50 px-2 py-0.5 text-xs font-semibold text-garnet-800"
              >
                {conditionLabel(entry.key)}
              </span>
            ))}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Add condition"
        onClick={onAdd}
        className="shrink-0 rounded-control px-1.5 py-0.5 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50 hover:text-garnet-800"
      >
        + Add
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Exhaustion
        </span>
        <button
          type="button"
          aria-label="Decrease exhaustion"
          disabled={exhaustionBusy || exhaustion <= 0}
          onClick={() => onStep(exhaustion - 1)}
          className={STEP}
        >
          <Minus aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <span
          aria-live="polite"
          className="min-w-[1rem] text-center font-display text-sm font-semibold tabular-nums text-parchment-900"
        >
          {exhaustion}
        </span>
        <button
          type="button"
          aria-label="Increase exhaustion"
          disabled={exhaustionBusy || exhaustion >= EXHAUSTION_MAX}
          onClick={() => onStep(exhaustion + 1)}
          className={STEP}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="ml-auto shrink-0">
        <RestButton />
      </div>
    </div>
  );
}
