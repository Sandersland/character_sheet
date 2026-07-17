/**
 * CombatUtilityStrip — the quiet one-line vitals strip that sits BELOW the turn
 * tracker on the live Combat tab (#982). It collapses what used to be a
 * full-height "No active conditions" card into a single line:
 *
 *   Conditions · <active chips | "none"> · + Add    ·    Exhaustion −N+    ·    Rest
 *
 * It stays one line tall when nothing is active and only grows to show chips when
 * conditions are applied. Conditions add/remove run through the shared
 * ConditionsSheetBody (so those transaction calls stay single-sourced) inside a
 * BottomSheet overlay — the picker never renders inline in the tracker's flow, so
 * opening it can't push the hero down. Exhaustion is stepped inline via ±
 * controls (the same `setExhaustion` op the conditions sheet uses), so there's no
 * second sheet-opening button colliding with the "manage conditions" name (#989).
 * Rest reuses the session RestButton.
 */

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { applyConditionTransactions } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import ConditionsSheetBody from "@/features/conditions/ConditionsSheetBody";
import RestButton from "@/features/hitpoints/RestButton";
import { conditionLabel, EXHAUSTION_MAX } from "@/lib/conditions";
import type { Character } from "@/types/character";

interface Props {
  character: Character;
  onUpdate: (character: Character) => void;
}

const STEP =
  "flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 bg-parchment-50 text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40";

export default function CombatUtilityStrip({ character, onUpdate }: Props) {
  // null = closed; "manage" opens the sheet as-is; "add" opens it with the
  // condition picker already expanded (the "+ Add" affordance).
  const [sheet, setSheet] = useState<null | "manage" | "add">(null);
  const [exhaustionBusy, setExhaustionBusy] = useState(false);
  const { active, exhaustion } = character.conditions;

  // Dynamic accessible name so the active conditions are announced, not hidden
  // behind a static "Manage conditions" (#989 review). Labels only — never keys.
  const conditionsLabel =
    active.length > 0
      ? `Manage conditions: ${active.map((c) => conditionLabel(c.key)).join(", ")}`
      : "Manage conditions";

  // Inline exhaustion step — the same setExhaustion transaction op the conditions
  // sheet fires, so exhaustion stays single-sourced through the client.
  async function stepExhaustion(next: number) {
    const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, next));
    if (clamped === exhaustion) return;
    setExhaustionBusy(true);
    try {
      const updated = await applyConditionTransactions(character.id, [
        { type: "setExhaustion", level: clamped },
      ]);
      onUpdate(updated);
    } finally {
      setExhaustionBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2 shadow-card">
      {/* Conditions summary — opens the full add/remove/exhaustion sheet. Uses
          spans (not a <ul>) so it stays valid phrasing content inside a button. */}
      <button
        type="button"
        aria-label={conditionsLabel}
        onClick={() => setSheet("manage")}
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

      {/* Direct "+ Add" — opens the picker expanded inside the overlay. */}
      <button
        type="button"
        onClick={() => setSheet("add")}
        className="shrink-0 rounded-control px-1.5 py-0.5 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50 hover:text-garnet-800"
      >
        + Add
      </button>

      {/* Exhaustion — inline ± steppers (no sheet, so no "manage conditions"
          name collision). Fires the same setExhaustion op as the sheet (#989). */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Exhaustion
        </span>
        <button
          type="button"
          aria-label="Decrease exhaustion"
          disabled={exhaustionBusy || exhaustion <= 0}
          onClick={() => stepExhaustion(exhaustion - 1)}
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
          onClick={() => stepExhaustion(exhaustion + 1)}
          className={STEP}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Rest — reuses the session rest control + its short/long-rest handlers. */}
      <div className="ml-auto shrink-0">
        <RestButton character={character} onUpdate={onUpdate} />
      </div>

      {sheet && (
        <BottomSheet title="Conditions" onClose={() => setSheet(null)}>
          {/* key={sheet} remounts on a mode switch so `defaultAddOpen` (read only
              at mount by AddConditionPanel) always reflects the current mode. */}
          <ConditionsSheetBody
            key={sheet}
            character={character}
            onUpdate={onUpdate}
            defaultAddOpen={sheet === "add"}
          />
        </BottomSheet>
      )}
    </div>
  );
}
