import { RowScoreCell, type RowScoreCellProps } from "@/features/character-create/ability-assignment/ScoreCells";
import type { AbilityRowData, Update } from "@/features/character-create/ability-assignment/types";
import { ABILITY_LABELS, abilityAbbr, formatModifier } from "@/lib/abilities";
import { setPlusOne, setPlusTwo, type SpreadMode } from "@/lib/abilityAssignment";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import type { AbilityName } from "@/types/character";

type BonusAssignment = CreationBackgroundBonuses["assignment"];

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
              className="h-4 w-4 accent-garnet-surface"
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
              className="h-4 w-4 accent-garnet-surface"
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
          className="inline-block h-3 w-3 rounded-full bg-garnet-surface"
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
  applicable: boolean;
  mode: SpreadMode;
  bonusAbilities: AbilityName[];
  bonusAssignment: BonusAssignment;
}

// display:contents makes each cell a direct item of the shared parent grid, so
// header and rows size their `auto` tracks together and align by construction
// (#1182); it paints nothing, so per-cell padding/self-center must live on the
// cells, not this wrapper.
export function AbilityRow(props: AbilityRowProps) {
  const { row, className, applicable, mode, bonusAbilities } = props;
  const label = ABILITY_LABELS[row.ability];
  const isBonusAbility = bonusAbilities.includes(row.ability);
  return (
    <div className="contents">
      <span className="flex flex-wrap items-baseline gap-x-2 self-center text-sm font-semibold text-parchment-800">
        <span className="sm:hidden">{abilityAbbr(row.ability)}</span>
        <span className="hidden sm:inline">{label}</span>
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

// The underline can't ride a contents wrapper's border, so it's a full-width divider row spanning every column.
export function RowHeader({ applicable, mode }: { applicable: boolean; mode: SpreadMode }) {
  return (
    <div className="contents text-[10px] font-bold uppercase tracking-wide text-parchment-500">
      <span className="self-center">Ability</span>
      <span className="text-center">{applicable ? "Base" : "Score"}</span>
      {applicable && mode === "twoOne" && (
        <>
          <span className="text-center">+2</span>
          <span className="text-center">+1</span>
        </>
      )}
      {applicable && mode === "oneOneOne" && <span className="text-center">+1</span>}
      <span className="text-center">{applicable ? "Total" : "Mod"}</span>
      <div aria-hidden className="col-span-full border-b border-parchment-200" />
    </div>
  );
}
