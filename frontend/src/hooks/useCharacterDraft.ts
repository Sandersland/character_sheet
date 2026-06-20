import { useEffect, useState } from "react";

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
  race: string;
  className: string;
  subclass: string;
  /** Catalog subclass id — empty string when none selected or class grants subclass post-L1. */
  subclassId: string;
  portraitUrl: string;
  background: string;
  useCustomBackground: boolean;
  customBackground: string;
  abilityMethod: AbilityMethod;
  abilityPool: number[] | null;
  abilityAssignments: Record<AbilityName, number | null>;
  abilityScores: AbilityScores;
  skillProficiencies: SkillName[];
  equipmentDraft: EquipmentDraft | null;
}

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  alignment: "",
  race: "",
  className: "",
  subclass: "",
  subclassId: "",
  portraitUrl: "",
  background: "",
  useCustomBackground: false,
  customBackground: "",
  abilityMethod: "manual",
  abilityPool: null,
  abilityAssignments: EMPTY_ASSIGNMENTS,
  abilityScores: DEFAULT_ABILITY_SCORES,
  skillProficiencies: [],
  equipmentDraft: null,
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
