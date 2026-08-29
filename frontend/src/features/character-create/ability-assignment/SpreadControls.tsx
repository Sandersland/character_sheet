import { CHIP_BASE } from "@/features/character-create/ability-assignment/constants";
import type { Update } from "@/features/character-create/ability-assignment/types";
import { toOneOneOne, toTwoOne, type SpreadMode } from "@/lib/abilityAssignment";
import type { CreationBackgroundBonuses } from "@/lib/characterCreation";
import type { AbilityName } from "@/types/character";

export function SpreadControls({
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
            className={`${CHIP_BASE} ${mode === "twoOne" ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface" : "border-parchment-300 text-parchment-700"}`}
          >
            +2 / +1
          </button>
          <button
            type="button"
            aria-pressed={mode === "oneOneOne"}
            onClick={() => { if (mode !== "oneOneOne") update({ backgroundAbilities: toOneOneOne(bonusAbilities) }); }}
            className={`${CHIP_BASE} ${mode === "oneOneOne" ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface" : "border-parchment-300 text-parchment-700"}`}
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
