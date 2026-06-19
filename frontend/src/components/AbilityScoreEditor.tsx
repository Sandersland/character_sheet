import { useState } from "react";

import { abilityModifier, formatModifier, ABILITY_LABELS } from "../lib/abilities";
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  pointBuyCost,
  totalPointBuyCost,
} from "../lib/abilityGen";
import type { RollSpec } from "../lib/dice";
import type { AbilityName, AbilityScores } from "../types/character";
import DiceRollSequence from "./DiceRollSequence";
import PhysicsDiceRoller from "./PhysicsDiceRoller";

type Method = "manual" | "roll" | "standardArray" | "pointBuy";

const METHOD_LABELS: [Method, string][] = [
  ["manual", "Manual entry"],
  ["roll", "Roll 4d6"],
  ["standardArray", "Standard array"],
  ["pointBuy", "Point buy"],
];

const ABILITY_ORDER: AbilityName[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const POINT_BUY_FLOOR = 8;
const POINT_BUY_CEILING = 15;

const POOL_SIZE = 6;
const ROLL_SPEC: RollSpec = { count: 4, faces: 6, dropLowest: 1 };

type Assignments = Record<AbilityName, number | null>;

const EMPTY_ASSIGNMENTS: Assignments = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

interface AbilityScoreEditorProps {
  method: Method;
  pool: number[] | null;
  assignments: Assignments;
  abilityScores: AbilityScores;
  onMethodChange: (method: Method, pool: number[] | null, assignments: Assignments) => void;
  onPoolChange: (pool: number[]) => void;
  onAssignmentsChange: (assignments: Assignments, scores: AbilityScores) => void;
  onScoresChange: (scores: AbilityScores) => void;
}

/**
 * Ability-score generation + assignment for character creation. Supports
 * all four 5e methods the player might show up with: rolled dice (4d6
 * drop-lowest, generated client-side via lib/abilityGen), the standard
 * array, point buy, and plain manual entry for stats already rolled
 * offline at the table.
 */
export default function AbilityScoreEditor({
  method,
  pool,
  assignments,
  abilityScores,
  onMethodChange,
  onPoolChange,
  onAssignmentsChange,
  onScoresChange,
}: AbilityScoreEditorProps) {
  function selectMethod(next: Method) {
    if (next === "standardArray") {
      onMethodChange(next, [...STANDARD_ARRAY], EMPTY_ASSIGNMENTS);
    } else if (next === "roll") {
      onMethodChange(next, null, EMPTY_ASSIGNMENTS);
      setRollNonce(0);
    } else if (next === "pointBuy") {
      onMethodChange(next, null, EMPTY_ASSIGNMENTS);
      onScoresChange({
        strength: POINT_BUY_FLOOR,
        dexterity: POINT_BUY_FLOOR,
        constitution: POINT_BUY_FLOOR,
        intelligence: POINT_BUY_FLOOR,
        wisdom: POINT_BUY_FLOOR,
        charisma: POINT_BUY_FLOOR,
      });
    } else {
      onMethodChange(next, null, EMPTY_ASSIGNMENTS);
    }
  }

  // Bumping `rollNonce` is what tells DiceRollSequence below to (re-)roll —
  // it animates the six 4d6-drop-lowest sets one at a time and reports the
  // final totals back via onComplete, which flows into the controlled
  // `pool`/`assignments` props exactly as the old instant roll did.
  const [rollNonce, setRollNonce] = useState(0);

  function rollPool() {
    setRollNonce((n) => n + 1);
  }

  function assignSlot(ability: AbilityName, slotIndex: number | null) {
    if (!pool) return;
    const next = { ...assignments };
    // Each rolled/array slot can only back one ability — clear it from
    // wherever else it was assigned before giving it to this one.
    for (const other of ABILITY_ORDER) {
      if (next[other] === slotIndex) next[other] = null;
    }
    next[ability] = slotIndex;

    const nextScores = { ...abilityScores };
    for (const a of ABILITY_ORDER) {
      const idx = next[a];
      if (idx !== null) nextScores[a] = pool[idx];
    }
    onAssignmentsChange(next, nextScores);
  }

  function adjustPointBuy(ability: AbilityName, delta: number) {
    const nextScore = abilityScores[ability] + delta;
    if (nextScore < POINT_BUY_FLOOR || nextScore > POINT_BUY_CEILING) return;
    const candidate = { ...abilityScores, [ability]: nextScore };
    if (totalPointBuyCost(Object.values(candidate)) > POINT_BUY_BUDGET) return;
    onScoresChange(candidate);
  }

  function setManualScore(ability: AbilityName, value: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    onScoresChange({ ...abilityScores, [ability]: parsed });
  }

  const pointBuySpent = method === "pointBuy" ? totalPointBuyCost(Object.values(abilityScores)) : 0;
  const remainingPoints = POINT_BUY_BUDGET - pointBuySpent;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {METHOD_LABELS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => selectMethod(value)}
            className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-semibold transition-colors ${
              method === value
                ? "border-[var(--color-arcane-500)] bg-[var(--color-arcane-50)] text-[var(--color-arcane-800)]"
                : "border-[var(--color-parchment-300)] text-[var(--color-parchment-600)] hover:border-[var(--color-arcane-400)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {method === "roll" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={rollPool}
              className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)]"
            >
              {pool ? "Re-roll" : "Roll scores"}
            </button>
            {pool && (
              <span className="text-xs text-[var(--color-parchment-600)]">
                Assign each below.
              </span>
            )}
          </div>
          <DiceRollSequence
            spec={ROLL_SPEC}
            count={POOL_SIZE}
            triggerKey={rollNonce > 0 ? rollNonce : undefined}
            restoredTotals={pool ?? undefined}
            roller={PhysicsDiceRoller}
            onComplete={(results) => {
              onPoolChange(results.map((r) => r.total));
              onAssignmentsChange(EMPTY_ASSIGNMENTS, abilityScores);
            }}
          />
        </div>
      )}

      {method === "pointBuy" && (
        <p className="text-xs font-semibold text-[var(--color-parchment-600)]">
          {remainingPoints} of {POINT_BUY_BUDGET} points remaining
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ABILITY_ORDER.map((ability) => {
          const usedByOther = new Set(
            ABILITY_ORDER.filter((a) => a !== ability && assignments[a] !== null).map(
              (a) => assignments[a] as number
            )
          );

          return (
            <div
              key={ability}
              className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] p-3"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
                {ABILITY_LABELS[ability]}
              </span>

              {(method === "roll" || method === "standardArray") && pool ? (
                <select
                  value={assignments[ability] ?? ""}
                  onChange={(e) =>
                    assignSlot(ability, e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  {pool.map(
                    (value, index) =>
                      !usedByOther.has(index) && (
                        <option key={index} value={index}>
                          {value}
                        </option>
                      )
                  )}
                </select>
              ) : method === "pointBuy" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustPointBuy(ability, -1)}
                    disabled={abilityScores[ability] <= POINT_BUY_FLOOR}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-parchment-300)] text-sm leading-none disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-display text-lg leading-none">
                    {abilityScores[ability]}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustPointBuy(ability, 1)}
                    disabled={
                      abilityScores[ability] >= POINT_BUY_CEILING ||
                      pointBuyCost(abilityScores[ability] + 1) - pointBuyCost(abilityScores[ability]) >
                        remainingPoints
                    }
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-parchment-300)] text-sm leading-none disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              ) : (
                <input
                  type="number"
                  value={abilityScores[ability]}
                  onChange={(e) => setManualScore(ability, e.target.value)}
                  className="w-20 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums"
                />
              )}

              <span className="text-xs text-[var(--color-parchment-500)]">
                Modifier {formatModifier(abilityModifier(abilityScores[ability]))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
