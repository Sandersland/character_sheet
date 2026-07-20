import { useState } from "react";

import Card from "@/components/ui/Card";
import { ABILITY_LABELS, formatModifier } from "@/lib/abilities";
import {
  abilityRows,
  adjustPointBuy,
  assignSlot,
  canDecrement,
  canIncrement,
  clearSlot,
  isPoolMethod,
  methodDefaults,
  remainingPoints,
  setPlusOne,
  setPlusTwo,
  spreadMode,
  toOneOneOne,
  toTwoOne,
  usedSlotIndices,
  EMPTY_ASSIGNMENTS,
  type AbilityAssignments,
} from "@/lib/abilityAssignment";
import AbilityRollTray from "@/features/character-create/AbilityRollTray";
import { POINT_BUY_BUDGET } from "@/lib/abilityGen";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import type { AbilityMethod, CharacterDraft } from "@/hooks/useCharacterDraft";
import type { AbilityName, AbilityScores } from "@/types/character";

interface AbilityAssignmentPanelProps {
  method: AbilityMethod;
  pool: number[] | null;
  assignments: AbilityAssignments;
  scores: AbilityScores;
  bonuses: CreationBackgroundBonuses;
  /** PHB'24 primary ability/abilities to flag as recommended (#1161). */
  primaryAbility: AbilityName[];
  /** Class display name shown beside a recommended row (e.g. "◆ Fighter"). */
  className: string;
  update: (patch: Partial<CharacterDraft>) => void;
}

const METHOD_CHIPS: [AbilityMethod, string][] = [
  ["manual", "Manual entry"],
  ["roll", "Roll 4d6"],
  ["standardArray", "Standard array"],
  ["pointBuy", "Point buy"],
];

const MANUAL_FLOOR = 1;
const MANUAL_CEILING = 30;

const CHIP_BASE =
  "rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors";
const STEP_BTN =
  "flex h-7 w-7 items-center justify-center rounded-full border border-parchment-300 text-base leading-none disabled:opacity-40";

/**
 * BG3-style ability generation + assignment for the creation ceremony (#1161).
 * One panel drives all four methods (manual, roll, standard array, point buy)
 * plus the PHB'24 background +2/+1 (or +1/+1/+1) spread. Presentation only —
 * every rule lives in abilityAssignment / abilityGen. The spread mode is derived
 * from the assignment, so switching background no longer needs a remount.
 */
export default function AbilityAssignmentPanel({
  method,
  pool,
  assignments,
  scores,
  bonuses,
  primaryAbility,
  className,
  update,
}: AbilityAssignmentPanelProps) {
  // Which pool chip the player is holding, waiting to drop into a row.
  const [held, setHeld] = useState<number | null>(null);
  const pooled = isPoolMethod(method);
  const { applicable, abilities: bonusAbilities, assignment: bonusAssignment, originFeat } = bonuses;
  const mode = spreadMode(bonusAssignment);

  function selectMethod(next: AbilityMethod) {
    setHeld(null);
    const defaults = methodDefaults(next);
    update({
      abilityMethod: next,
      abilityPool: defaults.pool,
      abilityAssignments: defaults.assignments,
      ...(defaults.scores ? { abilityScores: defaults.scores } : {}),
    });
  }

  function place(ability: AbilityName) {
    if (held === null || !pool) return;
    const next = assignSlot(assignments, scores, pool, ability, held);
    update({ abilityAssignments: next.assignments, abilityScores: next.scores });
    setHeld(null);
  }

  function clear(ability: AbilityName) {
    update({ abilityAssignments: clearSlot(assignments, ability) });
  }

  function adjustManual(ability: AbilityName, delta: number) {
    const next = Math.min(MANUAL_CEILING, Math.max(MANUAL_FLOOR, scores[ability] + delta));
    update({ abilityScores: { ...scores, [ability]: next } });
  }

  function setManual(ability: AbilityName, raw: string) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) return;
    update({ abilityScores: { ...scores, [ability]: parsed } });
  }

  const rows = abilityRows({ method, scores, pool, assignments, bonus: bonusAssignment, primaryAbility });
  const used = usedSlotIndices(assignments);

  // Ability | Base | [ +2 | +1 ] or [ +1 dot ] | Total/Mod.
  const gridCols = !applicable
    ? "minmax(0,1fr) auto auto"
    : mode === "twoOne"
      ? "minmax(0,1fr) auto auto auto auto"
      : "minmax(0,1fr) auto auto auto";

  return (
    <Card title="Ability Scores" headingLevel={2}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {METHOD_CHIPS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => selectMethod(value)}
              className={`${CHIP_BASE} ${
                method === value
                  ? "border-arcane-500 bg-arcane-50 text-arcane-800"
                  : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {method === "pointBuy" && (
          <p className="text-xs font-semibold text-parchment-600">
            {remainingPoints(scores)} of {POINT_BUY_BUDGET} points
          </p>
        )}

        {method === "manual" && (
          <p className="text-xs text-parchment-600">Enter scores rolled offline at the table.</p>
        )}

        {method === "roll" && (
          <AbilityRollTray
            pool={pool}
            hasAssignments={used.size > 0}
            onRolled={(rolled) => update({ abilityPool: rolled, abilityAssignments: EMPTY_ASSIGNMENTS })}
          />
        )}

        {pooled && pool && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ability score pool">
            {pool.map((value, index) => {
              const isUsed = used.has(index);
              const isHeld = held === index;
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`Assign ${value}`}
                  disabled={isUsed}
                  onClick={() => setHeld(isHeld ? null : index)}
                  className={`inline-flex h-9 w-11 items-center justify-center rounded-control border font-display text-sm tabular-nums transition-colors ${
                    isUsed
                      ? "border-parchment-300 bg-parchment-100 text-parchment-400 line-through"
                      : isHeld
                        ? "border-garnet-700 bg-garnet-700 text-parchment-50"
                        : "border-arcane-400 bg-arcane-50 text-arcane-800 hover:border-garnet-600"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div
            className="grid items-center gap-2 border-b border-parchment-200 pb-1 text-[10px] font-bold uppercase tracking-wide text-parchment-500"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span>Ability</span>
            <span className="text-center">{applicable ? "Base" : "Score"}</span>
            {applicable && mode === "twoOne" && (
              <>
                <span className="text-center">+2</span>
                <span className="text-center">+1</span>
              </>
            )}
            {applicable && mode === "oneOneOne" && <span className="text-center">+1</span>}
            <span className="text-center">{applicable ? "Total" : "Mod"}</span>
          </div>

          {rows.map((row) => {
            const label = ABILITY_LABELS[row.ability];
            const isBonusAbility = bonusAbilities.includes(row.ability);
            return (
              <div
                key={row.ability}
                className="grid items-center gap-2 py-1"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-parchment-800">
                  {label}
                  {row.recommended && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gold-500">
                      ◆ {className}
                    </span>
                  )}
                </span>

                <span className="flex justify-center">
                  {pooled ? (
                    row.base !== null ? (
                      <button
                        type="button"
                        aria-label={`Clear ${label}`}
                        onClick={() => clear(row.ability)}
                        className="inline-flex h-8 w-11 items-center justify-center rounded-control border border-arcane-400 bg-arcane-50 font-display text-sm tabular-nums text-arcane-800"
                      >
                        {row.base}
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Assign to ${label}`}
                        disabled={held === null}
                        onClick={() => place(row.ability)}
                        className="inline-flex h-8 w-11 items-center justify-center rounded-control border border-dashed border-parchment-300 text-sm text-parchment-400 disabled:opacity-50"
                      >
                        {held === null ? "–" : "+"}
                      </button>
                    )
                  ) : method === "pointBuy" ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${label}`}
                        disabled={!canDecrement(scores, row.ability)}
                        onClick={() => update({ abilityScores: adjustPointBuy(scores, row.ability, -1) })}
                        className={STEP_BTN}
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-display text-base tabular-nums">{scores[row.ability]}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${label}`}
                        disabled={!canIncrement(scores, row.ability)}
                        onClick={() => update({ abilityScores: adjustPointBuy(scores, row.ability, 1) })}
                        className={STEP_BTN}
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Decrease ${label}`}
                        onClick={() => adjustManual(row.ability, -1)}
                        className={STEP_BTN}
                      >
                        −
                      </button>
                      <input
                        aria-label={label}
                        type="number"
                        value={scores[row.ability]}
                        onChange={(e) => setManual(row.ability, e.target.value)}
                        className="w-14 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-center text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${label}`}
                        onClick={() => adjustManual(row.ability, 1)}
                        className={STEP_BTN}
                      >
                        +
                      </button>
                    </span>
                  )}
                </span>

                {applicable && mode === "twoOne" && (
                  <>
                    <span className="flex justify-center">
                      {isBonusAbility && (
                        <input
                          type="radio"
                          name="ability-plus-two"
                          aria-label={`+2 to ${label}`}
                          checked={bonusAssignment[row.ability] === 2}
                          onChange={() => update({ backgroundAbilities: setPlusTwo(bonusAssignment, bonusAbilities, row.ability) })}
                          className="h-4 w-4 accent-garnet-700"
                        />
                      )}
                    </span>
                    <span className="flex justify-center">
                      {isBonusAbility && (
                        <input
                          type="radio"
                          name="ability-plus-one"
                          aria-label={`+1 to ${label}`}
                          checked={bonusAssignment[row.ability] === 1}
                          onChange={() => update({ backgroundAbilities: setPlusOne(bonusAssignment, bonusAbilities, row.ability) })}
                          className="h-4 w-4 accent-garnet-700"
                        />
                      )}
                    </span>
                  </>
                )}
                {applicable && mode === "oneOneOne" && (
                  <span className="flex justify-center">
                    {isBonusAbility && (
                      <span
                        data-testid="spread-dot"
                        aria-label={`+1 to ${label}`}
                        className="inline-block h-3 w-3 rounded-full bg-garnet-700"
                      />
                    )}
                  </span>
                )}

                <span className="flex items-center justify-center gap-1 text-sm tabular-nums text-parchment-800">
                  {row.total === null ? (
                    <span className="text-parchment-400">–</span>
                  ) : (
                    <>
                      <span className="font-display">{row.total}</span>
                      <span className="text-xs text-parchment-500">{formatModifier(row.mod ?? 0)}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {applicable && (
          <div className="flex flex-col gap-3 rounded-card border border-parchment-200 bg-parchment-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Spread</span>
              <div className="flex gap-2" role="group" aria-label="Ability spread">
                <button
                  type="button"
                  aria-pressed={mode === "twoOne"}
                  onClick={() => { if (mode !== "twoOne") update({ backgroundAbilities: toTwoOne() }); }}
                  className={`${CHIP_BASE} ${mode === "twoOne" ? "border-garnet-700 bg-garnet-700 text-parchment-50" : "border-parchment-300 text-parchment-700"}`}
                >
                  +2 / +1
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "oneOneOne"}
                  onClick={() => { if (mode !== "oneOneOne") update({ backgroundAbilities: toOneOneOne(bonusAbilities) }); }}
                  className={`${CHIP_BASE} ${mode === "oneOneOne" ? "border-garnet-700 bg-garnet-700 text-parchment-50" : "border-parchment-300 text-parchment-700"}`}
                >
                  +1 / +1 / +1
                </button>
              </div>
            </div>
            {originFeat && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">Origin feat: {originFeat.name}</p>
                <p className="mt-1 text-sm text-parchment-700">{originFeat.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
