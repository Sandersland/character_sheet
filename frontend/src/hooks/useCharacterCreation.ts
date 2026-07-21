import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createCharacter, fetchItems } from "@/api/client";
import { useToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import type { ToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import {
  buildCreatePayload,
  deriveBackgroundBonuses,
  derivePreview,
  deriveSkillChoices,
  resolveSelections,
} from "@/lib/characterCreation";
import type {
  CreationBackgroundBonuses,
  CreationPreview,
  CreationSelections,
  CreationSkillChoices,
} from "@/lib/characterCreation";
import { stepPosition } from "@/lib/ceremonySteps";
import { creationMissing, creationStepMissing, creationSteps } from "@/lib/creationSteps";
import type { CreationStepKey } from "@/lib/creationSteps";
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
  backgroundBonuses: CreationBackgroundBonuses;
  catalog: Item[];
  preview: CreationPreview;
  missing: string[];
  isValid: boolean;
  submitting: boolean;
  submitError: boolean;
  save: () => Promise<void>;
  /** The ceremony walk (#1176) — spells step only for a level-1 caster. */
  steps: CreationStepKey[];
  stepIndex: number;
  currentStep: CreationStepKey;
  isLast: boolean;
  /** Whether the current step's own gate is satisfied. */
  canContinue: boolean;
  next: () => void;
  back: () => void;
  /** Leave the ceremony, keeping the draft for later. */
  cancel: () => void;
}

// Orchestrates the character-creation form: draft state, reference-driven
// derivations (in characterCreation), validation gating, and submit.
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

  // #1131: switching class invalidates the chosen spells (different list + counts),
  // so clear them on an actual change — the ref guards against the initial mount
  // (and a restored draft), which must keep the persisted picks.
  const prevClassName = useRef(draft.className);
  useEffect(() => {
    if (prevClassName.current !== draft.className) {
      prevClassName.current = draft.className;
      if (draft.cantripIds.length > 0 || draft.spellIds.length > 0) {
        update({ cantripIds: [], spellIds: [] });
      }
    }
  }, [draft.className, draft.cantripIds.length, draft.spellIds.length, update]);

  const selections = resolveSelections(reference, draft);
  const skillChoices = deriveSkillChoices(draft, selections);
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
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

  const steps = creationSteps(selections);
  const stepIndex = stepPosition(steps, draft.step);
  const currentStep = steps[stepIndex];
  const canContinue = creationStepMissing(currentStep, draft, selections).length === 0;
  const isLast = stepIndex === steps.length - 1;

  function next() {
    if (canContinue && !isLast) update({ step: steps[stepIndex + 1] });
  }

  function back() {
    if (stepIndex > 0) update({ step: steps[stepIndex - 1] });
  }

  function cancel() {
    navigate("/");
  }

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
    backgroundBonuses,
    catalog,
    preview: derivePreview(draft, selections),
    missing,
    isValid: missing.length === 0,
    submitting,
    submitError,
    save,
    steps,
    stepIndex,
    currentStep,
    isLast,
    canContinue,
    next,
    back,
    cancel,
  };
}
