import { MANUAL_CEILING, MANUAL_FLOOR } from "@/features/character-create/ability-assignment/constants";
import type { AbilityRowData, Update } from "@/features/character-create/ability-assignment/types";
import { adjustPointBuy, canDecrement, canIncrement } from "@/lib/abilityAssignment";
import type { AbilityMethod } from "@/hooks/useCharacterDraft";
import type { AbilityName, AbilityScores } from "@/types/character";

const STEP_BTN =
  "flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full border border-parchment-300 text-base leading-none disabled:opacity-40";

export interface RowScoreCellProps {
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
    <span className="flex items-center gap-1 sm:gap-2">
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
    <span className="flex items-center gap-1 sm:gap-1.5">
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
        min={MANUAL_FLOOR}
        max={MANUAL_CEILING}
        value={scores[row.ability]}
        onChange={(e) => onSetManual(row.ability, e.target.value)}
        className="w-10 sm:w-14 rounded-control border border-parchment-300 bg-parchment-50 px-1 sm:px-2 py-1 text-center text-sm tabular-nums"
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

export function RowScoreCell(props: RowScoreCellProps) {
  const Cell = props.pooled ? PooledScoreCell : props.method === "pointBuy" ? PointBuyScoreCell : ManualScoreCell;
  return (
    <span className="flex justify-center">
      <Cell {...props} />
    </span>
  );
}
