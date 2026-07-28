// Generic Choose-N ceremony body (#896): one component drives every
// catalog-backed level-up pick — maneuvers, tool proficiencies, fighting
// style, and (repeatable) subclass choices — via choiceConfigForStep, which
// resolves per STEP rather than per kind: a subclass's several choice tiers
// (e.g. a Hunter Ranger's four) share one draft array, keyed on step.meta.key.
// Enforces the plan's exact count; already-known options are hidden. The
// catalog fetch, selection, and list rendering each live in their own unit.

import { useMemo } from "react";

import ChoiceOptionsList from "@/features/level-up/ChoiceOptionsList";
import { useChoiceCatalog } from "@/features/level-up/useChoiceOptions";
import { useChoiceSelection } from "@/features/level-up/useChoiceSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { choiceConfigForStep } from "@/lib/levelUpChoices";
import type { LevelUpStep } from "@/types/character";

export default function ChoiceStep({ step }: { step: LevelUpStep }) {
  const { character, plan } = useLevelUpStepContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step's identity triple, never the step object: useChoiceOptions' effect depends on config identity, so a per-render config would refetch the catalog forever
  const config = useMemo(() => choiceConfigForStep(step), [step.kind, step.meta?.key, step.meta?.catalogSource]);
  const catalog = useChoiceCatalog(config, character, plan.target.newLevel);
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
