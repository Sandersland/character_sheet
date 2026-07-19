// Selection state for the New Spells step (#890): reads the draft's learnSpell
// ops and writes them back under the plan's hard cap. Split from the catalog
// fetch so neither concern carries the other's complexity (precedent:
// useChoiceSelection).
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { readNewSpellsMeta, selectedSpellIds, toggleLearnSpell } from "@/lib/newSpells";
import type { LevelUpStep } from "@/types/character";

export interface NewSpellsSelection {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
  selectedIds: string[];
  atCap: boolean;
  toggle: (spellId: string) => void;
}

export function useNewSpellsSelection(step: LevelUpStep): NewSpellsSelection {
  const { draft, setDraft } = useLevelUpStepContext();
  const { count, maxSpellLevel, magicalSecrets } = readNewSpellsMeta(step);
  const selectedIds = selectedSpellIds(draft.spellsLearned);

  function toggle(spellId: string) {
    setDraft((prev) => ({
      ...prev,
      spellsLearned: toggleLearnSpell(prev.spellsLearned ?? [], spellId, count),
    }));
  }

  return { count, maxSpellLevel, magicalSecrets, selectedIds, atCap: selectedIds.length >= count, toggle };
}
