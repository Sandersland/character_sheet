import { useState } from "react";

import Card from "@/components/ui/Card";
import { abilityLabel } from "@/lib/abilities";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import type { AbilityName } from "@/types/character";

interface BackgroundBonusesSectionProps {
  bonuses: CreationBackgroundBonuses;
  onChange: (assignment: Partial<Record<AbilityName, number>>) => void;
}

type SpreadMode = "twoOne" | "oneOneOne";

function initialMode(assignment: Partial<Record<AbilityName, number>>): SpreadMode {
  return Object.values(assignment).length === 3 ? "oneOneOne" : "twoOne";
}

const SELECT_CLASS =
  "rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900";

// PHB'24 background ability spread (#1130): choose +2/+1 across two of the three
// abilities, or +1 to all three. Read-only Origin-feat callout. Rendered only
// for a specced (non-custom, non-legacy) background — the parent gates on
// `bonuses.applicable`.
export default function BackgroundBonusesSection({ bonuses, onChange }: BackgroundBonusesSectionProps) {
  const [mode, setMode] = useState<SpreadMode>(() => initialMode(bonuses.assignment));
  const { abilities, assignment, originFeat } = bonuses;

  const plusTwo = abilities.find((a) => assignment[a] === 2);
  const plusOne = abilities.find((a) => assignment[a] === 1 && a !== plusTwo);

  function chooseMode(next: SpreadMode) {
    setMode(next);
    if (next === "oneOneOne") {
      onChange(Object.fromEntries(abilities.map((a) => [a, 1])));
    } else {
      onChange({});
    }
  }

  function setPlusTwo(ability: AbilityName) {
    onChange({ [ability]: 2, ...(plusOne && plusOne !== ability ? { [plusOne]: 1 } : {}) });
  }
  function setPlusOne(ability: AbilityName) {
    onChange({ ...(plusTwo && plusTwo !== ability ? { [plusTwo]: 2 } : {}), [ability]: 1 });
  }

  return (
    <Card title="Background Bonuses" headingLevel={2}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-parchment-600">
          Your background grants a +2 and a +1 to two different abilities, or a +1 to all three.
        </p>

        <div className="flex gap-2" role="group" aria-label="Ability spread">
          {(["twoOne", "oneOneOne"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => chooseMode(m)}
              className={`rounded-control border px-3 py-1.5 text-xs font-semibold ${
                mode === m
                  ? "border-garnet-700 bg-garnet-700 text-parchment-50"
                  : "border-parchment-300 text-parchment-700"
              }`}
            >
              {m === "twoOne" ? "+2 / +1" : "+1 / +1 / +1"}
            </button>
          ))}
        </div>

        {mode === "twoOne" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
              +2 to
              <select className={SELECT_CLASS} value={plusTwo ?? ""} onChange={(e) => setPlusTwo(e.target.value as AbilityName)}>
                <option value="">Select ability…</option>
                {abilities.map((a) => (
                  <option key={a} value={a}>
                    {abilityLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
              +1 to
              <select className={SELECT_CLASS} value={plusOne ?? ""} onChange={(e) => setPlusOne(e.target.value as AbilityName)}>
                <option value="">Select ability…</option>
                {abilities.map((a) => (
                  <option key={a} value={a} disabled={a === plusTwo}>
                    {abilityLabel(a)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="text-sm text-parchment-700">
            +1 to each of {abilities.map(abilityLabel).join(", ")}.
          </p>
        )}

        {originFeat ? (
          <div className="rounded-control border border-parchment-200 bg-parchment-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Origin feat: {originFeat.name}</p>
            <p className="mt-1 text-sm font-normal normal-case text-parchment-700">{originFeat.description}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
