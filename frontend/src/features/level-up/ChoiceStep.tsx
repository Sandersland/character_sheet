// Generic Choose-N ceremony body (#896): one component drives every
// catalog-backed level-up pick — maneuvers, disciplines, tool proficiencies,
// and (single-select) fighting style — off the CHOICE_KIND_CONFIGS wiring.
// Enforces the plan's exact count; already-known options are hidden. The
// catalog fetch, selection, and list rendering each live in their own unit.

import ChoiceOptionsList from "@/features/level-up/ChoiceOptionsList";
import { useChoiceCatalog } from "@/features/level-up/useChoiceOptions";
import { useChoiceSelection } from "@/features/level-up/useChoiceSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { CHOICE_KIND_CONFIGS } from "@/lib/levelUpChoices";
import type { LevelUpStep } from "@/types/character";

export default function ChoiceStep({ step }: { step: LevelUpStep }) {
  const { character } = useLevelUpStepContext();
  const config = CHOICE_KIND_CONFIGS[step.kind];
  const catalog = useChoiceCatalog(config, character);
  const { selectedIds, single, count, atCap, toggle } = useChoiceSelection(config, step);

  if (!config) return null;

  return (
    <div>
      <p className="text-center text-sm font-medium text-parchment-700">
        {single ? "Choose one" : `Choose ${count} — ${selectedIds.length} of ${count} chosen`}
      </p>

      <ChoiceOptionsList
        options={catalog.filtered}
        search={catalog.search}
        onSearch={catalog.setSearch}
        showSearch={catalog.showSearch}
        loadError={catalog.loadError}
        showSpinner={catalog.showSpinner}
        emptyText={catalog.emptyText}
        isSelected={(id) => selectedIds.includes(id)}
        isDisabled={(id) => !selectedIds.includes(id) && atCap}
        onToggle={toggle}
      />
    </div>
  );
}
