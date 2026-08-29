import { useState } from "react";

import { CHIP_BASE } from "@/features/character-create/ability-assignment/constants";
import type { Update } from "@/features/character-create/ability-assignment/types";
import { ABILITY_LABELS } from "@/lib/abilities";
import { setPlusOne, setPlusTwo, spreadMode, type SpreadMode } from "@/lib/abilityAssignment";
import type { CreationSpeciesBonuses, SpeciesAbilityChoice } from "@/lib/characterCreation";
import type { AbilityName } from "@/types/character";

type SpeciesAssignment = CreationSpeciesBonuses["assignment"];

function SpeciesChooseControl({
  choice,
  assignment,
  update,
}: {
  choice: Extract<SpeciesAbilityChoice, { kind: "choose" }>;
  assignment: SpeciesAssignment;
  update: Update;
}) {
  function toggle(ability: AbilityName) {
    const next = { ...assignment };
    if (next[ability] !== undefined) delete next[ability];
    else if (Object.keys(next).length < choice.count) next[ability] = choice.amount;
    update({ speciesAbilities: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-parchment-600">
        Choose {choice.count} (+{choice.amount} each):
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Species ability choice">
        {choice.abilities.map((ability) => {
          const checked = assignment[ability] !== undefined;
          const full = !checked && Object.keys(assignment).length >= choice.count;
          return (
            <button
              key={ability}
              type="button"
              aria-pressed={checked}
              disabled={full}
              onClick={() => toggle(ability)}
              className={`${CHIP_BASE} ${
                checked
                  ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface"
                  : "border-parchment-300 text-parchment-700 disabled:opacity-40"
              }`}
            >
              {ABILITY_LABELS[ability]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FLOATING_ONE_ONE_ONE_COUNT = 3;

// Mode is local, not derived from the assignment: +1/+1/+1 has an empty
// intermediate state that spreadMode would misread as +2/+1. Switching mode
// clears the pool (#1758).
function SpeciesFloatingControl({
  choice,
  assignment,
  update,
}: {
  choice: Extract<SpeciesAbilityChoice, { kind: "floating" }>;
  assignment: SpeciesAssignment;
  update: Update;
}) {
  const [mode, setMode] = useState<SpreadMode>(() => spreadMode(assignment));
  const abilities = choice.abilities;

  function selectMode(next: SpreadMode) {
    if (next === mode) return;
    setMode(next);
    update({ speciesAbilities: {} });
  }

  function toggleOne(ability: AbilityName) {
    const next = { ...assignment };
    if (next[ability] !== undefined) delete next[ability];
    else if (Object.keys(next).length < FLOATING_ONE_ONE_ONE_COUNT) next[ability] = 1;
    update({ speciesAbilities: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Spread</span>
        <div className="flex gap-2" role="group" aria-label="Species ability spread">
          <button
            type="button"
            aria-pressed={mode === "twoOne"}
            onClick={() => selectMode("twoOne")}
            className={`${CHIP_BASE} ${mode === "twoOne" ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface" : "border-parchment-300 text-parchment-700"}`}
          >
            +2 / +1
          </button>
          <button
            type="button"
            aria-pressed={mode === "oneOneOne"}
            onClick={() => selectMode("oneOneOne")}
            className={`${CHIP_BASE} ${mode === "oneOneOne" ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface" : "border-parchment-300 text-parchment-700"}`}
          >
            +1 / +1 / +1
          </button>
        </div>
      </div>

      {mode === "twoOne" ? (
        <div className="grid items-center gap-x-3 gap-y-1" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
          <span aria-hidden className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">Ability</span>
          <span aria-hidden className="text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500">+2</span>
          <span aria-hidden className="text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500">+1</span>
          {abilities.map((ability) => (
            <div key={ability} className="contents">
              <span className="text-sm font-semibold text-parchment-800">{ABILITY_LABELS[ability]}</span>
              <span className="flex justify-center">
                <input
                  type="radio"
                  name="species-plus-two"
                  aria-label={`+2 to ${ABILITY_LABELS[ability]}`}
                  checked={assignment[ability] === 2}
                  onChange={() => update({ speciesAbilities: setPlusTwo(assignment, abilities, ability) })}
                  className="h-4 w-4 accent-garnet-surface"
                />
              </span>
              <span className="flex justify-center">
                <input
                  type="radio"
                  name="species-plus-one"
                  aria-label={`+1 to ${ABILITY_LABELS[ability]}`}
                  checked={assignment[ability] === 1}
                  onChange={() => update({ speciesAbilities: setPlusOne(assignment, abilities, ability) })}
                  className="h-4 w-4 accent-garnet-surface"
                />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-parchment-600">Choose 3 (+1 each):</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Species ability spread choice">
            {abilities.map((ability) => {
              const checked = assignment[ability] !== undefined;
              const full = !checked && Object.keys(assignment).length >= FLOATING_ONE_ONE_ONE_COUNT;
              return (
                <button
                  key={ability}
                  type="button"
                  aria-pressed={checked}
                  disabled={full}
                  onClick={() => toggleOne(ability)}
                  className={`${CHIP_BASE} ${
                    checked
                      ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface"
                      : "border-parchment-300 text-parchment-700 disabled:opacity-40"
                  }`}
                >
                  {ABILITY_LABELS[ability]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Fixed species increases are announce-only text — the backend applies them
// with no player input. Kept separate from SpreadControls: species and
// background bonuses never both apply to one character (opposite editions)
// (#1681/#1758).
export function SpeciesBonusBlock({
  bonuses,
  update,
}: {
  bonuses: CreationSpeciesBonuses;
  update: Update;
}) {
  const { fixed, choice, assignment } = bonuses;
  const fixedEntries = Object.entries(fixed) as [AbilityName, number][];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-parchment-200 bg-parchment-100 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Species Bonuses</span>
      {fixedEntries.length > 0 && (
        <p className="text-sm text-parchment-700">
          {fixedEntries.map(([ability, amount]) => `+${amount} ${ABILITY_LABELS[ability]}`).join(", ")}
        </p>
      )}
      {choice?.kind === "choose" && <SpeciesChooseControl choice={choice} assignment={assignment} update={update} />}
      {choice?.kind === "floating" && <SpeciesFloatingControl choice={choice} assignment={assignment} update={update} />}
    </div>
  );
}
