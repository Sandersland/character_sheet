import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createCharacter, fetchItems } from "@/api/client";
import { useToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import type { ToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import {
  buildCreatePayload,
  creationMissing,
  derivePreview,
  deriveSkillChoices,
  resolveSelections,
} from "@/lib/characterCreation";
import type {
  CreationPreview,
  CreationSelections,
  CreationSkillChoices,
} from "@/lib/characterCreation";
import type { Item, ReferenceData, SkillName } from "@/types/character";
import { useCharacterDraft } from "@/hooks/useCharacterDraft";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useReferenceData } from "@/hooks/useReferenceData";

export interface CharacterCreationSkills extends CreationSkillChoices {
  toggle: (skill: SkillName) => void;
}

export interface CharacterCreation {
  reference: ReferenceData | null;
  referenceError: boolean;
  showSpinner: boolean;
  draft: CharacterDraft;
  update: (patch: Partial<CharacterDraft>) => void;
  clear: () => void;
  selections: CreationSelections;
  skills: CharacterCreationSkills;
  toolChoices: ToolProficiencyChoices;
  catalog: Item[];
  preview: CreationPreview;
  missing: string[];
  isValid: boolean;
  submitting: boolean;
  submitError: boolean;
  save: () => Promise<void>;
}

// Orchestrates the character-creation form: draft state, reference-driven
// derivations (in lib/characterCreation), validation gating, and submit.
export function useCharacterCreation(): CharacterCreation {
  const navigate = useNavigate();
  const { draft, update, clear } = useCharacterDraft();
  const { reference, error: referenceError } = useReferenceData();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const showSpinner = useDelayedFlag(!reference && !referenceError);

  // Load the item catalog once for the equipment picker's open-pick dropdowns.
  useEffect(() => {
    fetchItems().then(setCatalog).catch(() => {});
  }, []);

  const selections = resolveSelections(reference, draft);
  const skillChoices = deriveSkillChoices(draft, selections);
  const toolChoices = useToolProficiencyChoices({
    draft,
    selectedClass: selections.class,
    selectedRace: selections.race,
    selectedBackground: selections.background,
    update,
  });

  function toggleSkill(skill: SkillName) {
    if (skillChoices.selected.includes(skill)) {
      update({ skillProficiencies: draft.skillProficiencies.filter((s) => s !== skill) });
    } else if (skillChoices.selected.length < skillChoices.max) {
      update({ skillProficiencies: [...draft.skillProficiencies, skill] });
    }
  }

  const missing = creationMissing(draft, selections);

  async function save() {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const payload = buildCreatePayload(
        draft,
        selections,
        skillChoices,
        toolChoices.selectedToolChoices
      );
      const created = await createCharacter(payload);
      clear();
      // Replace (not push) so the now-stale empty form doesn't linger in history.
      navigate(`/characters/${created.id}`, { replace: true });
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    reference,
    referenceError,
    showSpinner,
    draft,
    update,
    clear,
    selections,
    skills: { ...skillChoices, toggle: toggleSkill },
    toolChoices,
    catalog,
    preview: derivePreview(draft, selections),
    missing,
    isValid: missing.length === 0,
    submitting,
    submitError,
    save,
  };
}
