// Selection state for the New Spells step (#890): reads the draft's learnSpell
// ops and writes them back under the plan's hard cap. Split from the catalog
// fetch so neither concern carries the other's complexity (precedent:
// useChoiceSelection).
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { readNewSpellsMeta, selectedSpellIds, toggleForgetSpell, toggleLearnSpell } from "@/lib/newSpells";
import type { LevelUpStep } from "@/types/character";

export interface NewSpellsSelection {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
  /** #1101/#1127: an onLevelUp-cadence caster may swap one prepared spell this level-up. */
  canSwap: boolean;
  selectedIds: string[];
  /** The entry id of the spell staged to be swapped out, or null. */
  forgottenEntryId: string | null;
  atCap: boolean;
  toggle: (spellId: string) => void;
  toggleForget: (entryId: string) => void;
}

export function useNewSpellsSelection(step: LevelUpStep): NewSpellsSelection {
  const { draft, setDraft } = useLevelUpStepContext();
  const { count, maxSpellLevel, magicalSecrets, canSwap } = readNewSpellsMeta(step);
  const selectedIds = selectedSpellIds(draft.spellsLearned);
  const forgottenEntryId = draft.spellsForgotten?.[0]?.entryId ?? null;
  // #1101: a staged swap raises the learn cap by one (the extra replacement pick).
  const cap = count + (draft.spellsForgotten?.length ?? 0);

  function toggle(spellId: string) {
    setDraft((prev) => ({
      ...prev,
      spellsLearned: toggleLearnSpell(prev.spellsLearned ?? [], spellId, cap),
    }));
  }

  function toggleForget(entryId: string) {
    setDraft((prev) => ({ ...prev, ...toggleForgetSpell(prev, entryId, count) }));
  }

  return {
    count, maxSpellLevel, magicalSecrets, canSwap,
    selectedIds, forgottenEntryId, atCap: selectedIds.length >= cap, toggle, toggleForget,
  };
}
