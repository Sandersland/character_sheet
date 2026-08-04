import { useEffect, useState } from "react";

import type { RulesEdition } from "@character-sheet/shared-types";

import type { CreationStepKey } from "@/lib/creationSteps";
import type { EquipmentDraft } from "@/lib/startingEquipment";
import type { AbilityName, AbilityScores, SkillName } from "@/types/character";

const DRAFT_STORAGE_KEY = "character-draft:new";

export type AbilityMethod = "manual" | "roll" | "standardArray" | "pointBuy";

const DEFAULT_ABILITY_SCORES: AbilityScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

const EMPTY_ASSIGNMENTS: Record<AbilityName, number | null> = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

export interface CharacterDraft {
  name: string;
  alignment: string;
  /** #1680: catalog species id — the two-step picker's first step, replacing
   *  the flat `race` name field it superseded. Empty = not yet chosen. */
  speciesId: string;
  /** #1680: catalog variant id — the second step, required (non-empty)
   *  whenever the chosen species has variant rows (mirrors subclassId's
   *  shape); empty for a variantless species or before a species is picked. */
  variantId: string;
  className: string;
  subclass: string;
  /** Catalog subclass id — empty string when none selected or class grants subclass post-L1. */
  subclassId: string;
  background: string;
  useCustomBackground: boolean;
  customBackground: string;
  abilityMethod: AbilityMethod;
  abilityPool: number[] | null;
  abilityAssignments: Record<AbilityName, number | null>;
  abilityScores: AbilityScores;
  /** PHB'24 background ability spread (#1130): ability→bump map over the
   *  background's three abilityChoices. Empty until assigned / for spec-less backgrounds. */
  backgroundAbilities: Partial<Record<AbilityName, number>>;
  /** 2014 species/subrace CHOSEN ability increases (#1681): ability→bump map
   *  over the merged species+variant spec's choose component (Half-Elf's "+1
   *  to two of your choice"). Empty for a fixed-only or variantless species,
   *  and for every 2024 species (the spec is always []). */
  speciesAbilities: Partial<Record<AbilityName, number>>;
  /** #1683: the 2024 lineage/legacy casting-ability choice (Int/Wis/Cha) —
   *  empty string when not yet chosen or the selected species/variant has no
   *  such choice (SpeciesVariantOption.needsCastingAbility false). */
  castingAbility: "" | "intelligence" | "wisdom" | "charisma";
  /** #1689: species-granted skill choice (Half-Elf's Skill Versatility) —
   *  empty for a species with no chooseSkills spec served. */
  speciesSkills: SkillName[];
  /** #1689: species-granted cantrip choice (High Elf's Cantrip) — catalog
   *  spell id, empty string for none chosen / no chooseCantrip spec served. */
  speciesCantripId: string;
  /** #1690: species-granted Origin feat choice (2024 Human's Versatile) —
   *  catalog feat id, empty string for none chosen / no chooseOriginFeat
   *  spec served. */
  speciesOriginFeatId: string;
  skillProficiencies: SkillName[];
  /** Tool proficiency names chosen by the player at character creation. */
  toolChoices: string[];
  /** #1131: chosen level-1 cantrip catalog ids (casters only). */
  cantripIds: string[];
  /** #1131/#1510: chosen level-1 spell catalog ids (casters only) — prepared
   *  or known per the class's edition model; empty for a 2014 Cleric/Druid,
   *  which has no creation-time list to choose from. */
  spellIds: string[];
  equipmentDraft: EquipmentDraft | null;
  /** #1565: the background's OWN equipment draft, parallel to equipmentDraft
   *  above but for the background's package instead of the class's — null
   *  both before a background with a package is chosen AND for one with none. */
  backgroundEquipmentDraft: EquipmentDraft | null;
  /** #1176: the creation-ceremony step the player is on, so a reload resumes there. */
  step: CreationStepKey;
  /** #1286: resolved by CreationEntryGate before the identity step is reachable —
   *  null means the gate hasn't run yet (never a silently-applied default). */
  rulesEdition: RulesEdition | null;
  /** #1286: the campaign this character is being created for, or null for solo.
   *  Set alongside rulesEdition by the same gate resolution. */
  campaignId: string | null;
  /** #1286: the chosen campaign's display name, carried alongside campaignId so
   *  the Review step can echo it without a second fetch. Null for solo. */
  campaignName: string | null;
  /** #1286: set once createCharacter succeeds, so a retry (even after a page
   *  refresh) resumes the campaign attach instead of calling createCharacter
   *  again — createCharacter is not idempotent, and this field (unlike a
   *  useState) survives the refresh because the whole draft is persisted. */
  createdId: string | null;
}

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  alignment: "",
  speciesId: "",
  variantId: "",
  className: "",
  subclass: "",
  subclassId: "",
  background: "",
  useCustomBackground: false,
  customBackground: "",
  abilityMethod: "manual",
  abilityPool: null,
  abilityAssignments: EMPTY_ASSIGNMENTS,
  abilityScores: DEFAULT_ABILITY_SCORES,
  backgroundAbilities: {},
  speciesAbilities: {},
  castingAbility: "",
  speciesSkills: [],
  speciesCantripId: "",
  speciesOriginFeatId: "",
  skillProficiencies: [],
  toolChoices: [],
  cantripIds: [],
  spellIds: [],
  equipmentDraft: null,
  backgroundEquipmentDraft: null,
  step: "identity",
  rulesEdition: null,
  campaignId: null,
  campaignName: null,
  createdId: null,
};

/**
 * Stages the in-progress form in localStorage so a player can fill in what
 * they know now, navigate away, and come back to finish later — the form
 * only talks to the backend once, on the first Save.
 */
export function useCharacterDraft() {
  const [draft, setDraft] = useState<CharacterDraft>(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      return stored ? { ...EMPTY_DRAFT, ...JSON.parse(stored) } : EMPTY_DRAFT;
    } catch {
      return EMPTY_DRAFT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage may be unavailable (private browsing, quota, etc).
      // Creation still works for the current session — it just won't
      // survive a reload.
    }
  }, [draft]);

  function update(patch: Partial<CharacterDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function clear() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore — nothing to clean up if storage was never available
    }
    setDraft(EMPTY_DRAFT);
  }

  return { draft, update, clear };
}
