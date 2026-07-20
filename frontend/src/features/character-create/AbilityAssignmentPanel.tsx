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

type AbilityRowData = ReturnType<typeof abilityRows>[number];
type SpreadMode = ReturnType<typeof spreadMode>;
type BonusAssignment = CreationBackgroundBonuses["assignment"];
type Update = (patch: Partial<CharacterDraft>) => void;

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

function MethodChips({ method, onSelect }: { method: AbilityMethod; onSelect: (m: AbilityMethod) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {METHOD_CHIPS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
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
  );
}

function PoolChips({
  pool,
  used,
  held,
  onHold,
}: {
  pool: number[];
  used: Set<number>;
  held: number | null;
  onHold: (index: number | null) => void;
}) {
  return (
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
            onClick={() => onHold(isHeld ? null : index)}
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
  );
}

interface RowScoreCellProps {
  row: AbilityRowData;
  label: string;
  pooled: boolean;
  method: AbilityMethod;
  held: number | null;
  scores: AbilityScores;
  onPlace: (a: AbilityName) => void;
  onClear: (a: AbilityName) => void;
  onAdjustManual: (a: AbilityName, delta: number) => void;
  onSetManual: (a: AbilityName, raw: string) => void;
  update: Update;
}

function PooledScoreCell({ row, label, held, onPlace, onClear }: RowScoreCellProps) {
  if (row.base !== null) {
    return (
      <button
        type="button"
        aria-label={`Clear ${label}`}
        onClick={() => onClear(row.ability)}
        className="inline-flex h-8 w-11 items-center justify-center rounded-control border border-arcane-400 bg-arcane-50 font-display text-sm tabular-nums text-arcane-800"
      >
        {row.base}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Assign to ${label}`}
      disabled={held === null}
      onClick={() => onPlace(row.ability)}
      className="inline-flex h-8 w-11 items-center justify-center rounded-control border border-dashed border-parchment-300 text-sm text-parchment-400 disabled:opacity-50"
    >
      {held === null ? "–" : "+"}
    </button>
  );
}

function PointBuyScoreCell({ row, label, scores, update }: RowScoreCellProps) {
  return (
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
  );
}

function ManualScoreCell({ row, label, scores, onAdjustManual, onSetManual }: RowScoreCellProps) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onAdjustManual(row.ability, -1)}
        className={STEP_BTN}
      >
        −
      </button>
      <input
        aria-label={label}
        type="number"
        value={scores[row.ability]}
        onChange={(e) => onSetManual(row.ability, e.target.value)}
        className="w-14 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-center text-sm tabular-nums"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onAdjustManual(row.ability, 1)}
        className={STEP_BTN}
      >
        +
      </button>
    </span>
  );
}

function RowScoreCell(props: RowScoreCellProps) {
  const Cell = props.pooled ? PooledScoreCell : props.method === "pointBuy" ? PointBuyScoreCell : ManualScoreCell;
  return (
    <span className="flex justify-center">
      <Cell {...props} />
    </span>
  );
}

interface RowBonusCellsProps {
  row: AbilityRowData;
  label: string;
  mode: SpreadMode;
  isBonusAbility: boolean;
  bonusAbilities: AbilityName[];
  bonusAssignment: BonusAssignment;
  update: Update;
}

function RowBonusCells({ row, label, mode, isBonusAbility, bonusAbilities, bonusAssignment, update }: RowBonusCellsProps) {
  if (mode === "twoOne") {
    return (
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
    );
  }
  return (
    <span className="flex justify-center">
      {isBonusAbility && (
        <span
          data-testid="spread-dot"
          aria-label={`+1 to ${label}`}
          className="inline-block h-3 w-3 rounded-full bg-garnet-700"
        />
      )}
    </span>
  );
}

function RowTotal({ row }: { row: AbilityRowData }) {
  return (
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
  );
}

interface AbilityRowProps extends RowScoreCellProps {
  className: string;
  gridCols: string;
  applicable: boolean;
  mode: SpreadMode;
  bonusAbilities: AbilityName[];
  bonusAssignment: BonusAssignment;
}

function AbilityRow(props: AbilityRowProps) {
  const { row, className, gridCols, applicable, mode, bonusAbilities } = props;
  const label = ABILITY_LABELS[row.ability];
  const isBonusAbility = bonusAbilities.includes(row.ability);
  return (
    <div className="grid items-center gap-2 py-1" style={{ gridTemplateColumns: gridCols }}>
      <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-parchment-800">
        {label}
        {row.recommended && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-gold-500">◆ {className}</span>
        )}
      </span>

      <RowScoreCell {...props} label={label} />

      {applicable && (
        <RowBonusCells
          row={row}
          label={label}
          mode={mode}
          isBonusAbility={isBonusAbility}
          bonusAbilities={bonusAbilities}
          bonusAssignment={props.bonusAssignment}
          update={props.update}
        />
      )}

      <RowTotal row={row} />
    </div>
  );
}

function RowHeader({ applicable, mode, gridCols }: { applicable: boolean; mode: SpreadMode; gridCols: string }) {
  return (
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
  );
}

function SpreadControls({
  mode,
  bonusAbilities,
  originFeat,
  update,
}: {
  mode: SpreadMode;
  bonusAbilities: AbilityName[];
  originFeat: CreationBackgroundBonuses["originFeat"];
  update: Update;
}) {
  return (
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
  );
}

// Column template: Ability | Base | [ +2 | +1 ] or [ +1 dot ] | Total/Mod.
function gridColumns(applicable: boolean, mode: SpreadMode): string {
  if (!applicable) return "minmax(0,1fr) auto auto";
  return mode === "twoOne" ? "minmax(0,1fr) auto auto auto auto" : "minmax(0,1fr) auto auto auto";
}

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
  const gridCols = gridColumns(applicable, mode);

  return (
    <Card title="Ability Scores" headingLevel={2}>
      <div className="flex flex-col gap-4 p-4">
        <MethodChips method={method} onSelect={selectMethod} />

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

        {pooled && pool && <PoolChips pool={pool} used={used} held={held} onHold={setHeld} />}

        <div className="flex flex-col gap-1">
          <RowHeader applicable={applicable} mode={mode} gridCols={gridCols} />
          {rows.map((row) => (
            <AbilityRow
              key={row.ability}
              row={row}
              className={className}
              gridCols={gridCols}
              applicable={applicable}
              mode={mode}
              pooled={pooled}
              method={method}
              held={held}
              scores={scores}
              bonusAbilities={bonusAbilities}
              bonusAssignment={bonusAssignment}
              label={ABILITY_LABELS[row.ability]}
              onPlace={place}
              onClear={clear}
              onAdjustManual={adjustManual}
              onSetManual={setManual}
              update={update}
            />
          ))}
        </div>

        {applicable && (
          <SpreadControls mode={mode} bonusAbilities={bonusAbilities} originFeat={originFeat} update={update} />
        )}
      </div>
    </Card>
  );
}
