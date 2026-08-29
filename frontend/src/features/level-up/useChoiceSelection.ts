import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { nextChoiceSelection, type ChoiceKindConfig } from "@/lib/levelUpChoices";
import type { LevelUpStep } from "@/types/character";

export interface ChoiceSelection {
  selectedIds: string[];
  single: boolean;
  count: number;
  atCap: boolean;
  toggle: (id: string) => void;
}

export function useChoiceSelection(
  config: ChoiceKindConfig | undefined,
  step: LevelUpStep,
): ChoiceSelection {
  const { draft, setDraft } = useLevelUpStepContext();
  const selectedIds = config?.selected(draft) ?? [];
  const single = config?.single ?? false;
  const count = step.count ?? 1;

  function toggle(id: string) {
    if (!config) return;
    const next = nextChoiceSelection(selectedIds, id, { single, count });
    if (next) setDraft((prev) => ({ ...prev, ...config.select(prev, next) }));
  }

  return { selectedIds, single, count, atCap: !single && selectedIds.length >= count, toggle };
}
