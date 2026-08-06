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
  /** #1101/#1127: an onLevelUp-cadence caster (either edition's model) may swap one spell this level-up. */
  canSwap: boolean;
  selectedIds: string[];
  /** The entry id of the spell staged to be swapped out, or null. */
  forgottenEntryId: string | null;
  toggle: (spellId: string) => void;
  toggleForget: (entryId: string) => void;
  /** #1131: new cantrips picked this level, kept separate from leveled learns. */
  cantrips: number;
  cantripSelectedIds: string[];
  toggleCantrip: (spellId: string) => void;
  /** #1440: the server-served class-list facts (null = unrestricted). */
  spellLists: string[] | null;
  cantripLists: string[] | null;
  /** #1509 D5: the served known-vs-prepared noun for this step's swap copy. */
  casterModel: "known" | "prepared" | null;
}

export function useNewSpellsSelection(step: LevelUpStep): NewSpellsSelection {
  const { draft, setDraft } = useLevelUpStepContext();
  const { count, maxSpellLevel, magicalSecrets, canSwap, cantrips, spellLists, cantripLists, casterModel } = readNewSpellsMeta(step);
  const selectedIds = selectedSpellIds(draft.spellsLearned);
  const cantripSelectedIds = selectedSpellIds(draft.cantripsLearned);
  const forgottenEntryId = draft.spellsForgotten?.[0]?.entryId ?? null;
  // #1101: a staged swap raises the learn cap by one (the extra replacement pick).
  const cap = count + (draft.spellsForgotten?.length ?? 0);

  function toggle(spellId: string) {
    setDraft((prev) => ({
      ...prev,
      spellsLearned: toggleLearnSpell(prev.spellsLearned ?? [], spellId, cap),
    }));
  }

  function toggleCantrip(spellId: string) {
    setDraft((prev) => ({
      ...prev,
      cantripsLearned: toggleLearnSpell(prev.cantripsLearned ?? [], spellId, cantrips),
    }));
  }

  function toggleForget(entryId: string) {
    setDraft((prev) => ({ ...prev, ...toggleForgetSpell(prev, entryId, count) }));
  }

  return {
    count, maxSpellLevel, magicalSecrets, canSwap,
    selectedIds, forgottenEntryId, toggle, toggleForget,
    cantrips, cantripSelectedIds, toggleCantrip,
    spellLists, cantripLists, casterModel,
  };
}
