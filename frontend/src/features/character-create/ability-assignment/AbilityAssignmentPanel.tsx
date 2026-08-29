import { useState } from "react";

import Card from "@/components/ui/Card";
import { AbilityRow, RowHeader } from "@/features/character-create/ability-assignment/AbilityRow";
import { MANUAL_CEILING, MANUAL_FLOOR } from "@/features/character-create/ability-assignment/constants";
import { MethodChips, PoolChips } from "@/features/character-create/ability-assignment/MethodChips";
import { SpeciesBonusBlock } from "@/features/character-create/ability-assignment/SpeciesBonusBlock";
import { SpreadControls } from "@/features/character-create/ability-assignment/SpreadControls";
import { ABILITY_LABELS } from "@/lib/abilities";
import {
  abilityRows,
  assignSlot,
  clearSlot,
  isPoolMethod,
  methodDefaults,
  remainingPoints,
  spreadMode,
  sumBonusMaps,
  usedSlotIndices,
  EMPTY_ASSIGNMENTS,
  type AbilityAssignments,
  type SpreadMode,
} from "@/lib/abilityAssignment";
import AbilityRollTray from "@/features/character-create/AbilityRollTray";
import { POINT_BUY_BUDGET } from "@/lib/abilityGen";
import type { CreationBackgroundBonuses, CreationSpeciesBonuses } from "@/lib/characterCreation";
import type { AbilityMethod, CharacterDraft } from "@/hooks/useCharacterDraft";
import type { AbilityName, AbilityScores } from "@/types/character";

interface AbilityAssignmentPanelProps {
  method: AbilityMethod;
  pool: number[] | null;
  assignments: AbilityAssignments;
  scores: AbilityScores;
  bonuses: CreationBackgroundBonuses;
  /** Inert when `applicable` is false (#1681). */
  speciesBonuses: CreationSpeciesBonuses;
  /** PHB'24 primary ability/abilities, flagged as recommended (#1161). */
  primaryAbility: AbilityName[];
  /** Display name of the class, not a CSS class list — shown beside a recommended row. */
  className: string;
  update: (patch: Partial<CharacterDraft>) => void;
}

function gridColumns(applicable: boolean, mode: SpreadMode): string {
  if (!applicable) return "minmax(0,1fr) auto auto";
  return mode === "twoOne" ? "minmax(0,1fr) auto auto auto auto" : "minmax(0,1fr) auto auto auto";
}

export default function AbilityAssignmentPanel({
  method,
  pool,
  assignments,
  scores,
  bonuses,
  speciesBonuses,
  primaryAbility,
  className,
  update,
}: AbilityAssignmentPanelProps) {
  const [held, setHeld] = useState<number | null>(null);
  const pooled = isPoolMethod(method);
  const { applicable, abilities: bonusAbilities, assignment: bonusAssignment, originFeat } = bonuses;
  const mode = spreadMode(bonusAssignment);
  // Species and background bonuses never both apply to one character, so
  // summing them unconditionally needs no edition branch of its own (#1681).
  const combinedBonus = sumBonusMaps(bonusAssignment, speciesBonuses.fixed, speciesBonuses.assignment);

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
    // Number("") is 0, so guard the empty field before it clobbers the score with 0.
    if (!raw.trim()) return;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) return;
    const clamped = Math.min(MANUAL_CEILING, Math.max(MANUAL_FLOOR, parsed));
    update({ abilityScores: { ...scores, [ability]: clamped } });
  }

  const rows = abilityRows({ method, scores, pool, assignments, bonus: combinedBonus, primaryAbility });
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

        <div className="grid items-center gap-x-1.5 gap-y-1 sm:gap-x-2" style={{ gridTemplateColumns: gridCols }}>
          <RowHeader applicable={applicable} mode={mode} />
          {rows.map((row) => (
            <AbilityRow
              key={row.ability}
              row={row}
              className={className}
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

        {speciesBonuses.applicable && <SpeciesBonusBlock bonuses={speciesBonuses} update={update} />}
      </div>
    </Card>
  );
}
