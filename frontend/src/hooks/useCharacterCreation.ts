import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { addCharacterToCampaign, createCharacter, fetchItems, uploadCharacterPortrait } from "@/api/client";
import { useToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import type { ToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";
import {
  buildCreatePayload,
  deriveBackgroundBonuses,
  derivePreview,
  deriveSkillChoices,
  deriveSpeciesBonuses,
  resolveSelections,
} from "@/lib/characterCreation";
import type {
  CreationBackgroundBonuses,
  CreationPreview,
  CreationSelections,
  CreationSkillChoices,
  CreationSpeciesBonuses,
} from "@/lib/characterCreation";
import { stepPosition } from "@/lib/ceremonySteps";
import { creationMissing, creationStepMissing, creationSteps } from "@/lib/creationSteps";
import type { CreationStepKey } from "@/lib/creationSteps";
import { errorMessage } from "@/lib/errorMessage";
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
  /** #1681: 2014 species/subrace ability increases — inert (applicable:false)
   *  for a 2024 character or an unmatched/fixed-only race name. */
  speciesBonuses: CreationSpeciesBonuses;
  catalog: Item[];
  /** #1616: the staged portrait image, uploaded after create. Component state,
   *  not draft state — a File JSON-serializes to {}, so it cannot ride the
   *  persisted CharacterDraft; a mid-ceremony refresh loses the selection
   *  (retryable from the sheet's Story tab after creation). */
  portraitFile: File | null;
  setPortraitFile: (file: File | null) => void;
  preview: CreationPreview;
  missing: string[];
  isValid: boolean;
  submitting: boolean;
  /** The real error text (create OR the campaign attach), or null. Never a
   *  generic "check the form" — by the time save() can run, the form IS valid. */
  submitError: string | null;
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
  const { draft, update, clear: clearDraft } = useCharacterDraft();
  // draft.rulesEdition is null until CreationEntryGate resolves it (#1286) —
  // useReferenceData's skipToken defers the fetch until then, rather than
  // fetching a wrong/default edition's catalog underneath the gate.
  const { reference, error: referenceError } = useReferenceData(draft.rulesEdition);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
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
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
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

  // Wraps useCharacterDraft's clear so Start Over also resets submitError and
  // the staged portrait file — clearDraft() alone already drops any pending
  // created-but-unattached id (draft.createdId, part of the same persisted
  // object), but those two live in component state beside the draft.
  function clear() {
    clearDraft();
    setSubmitError(null);
    setPortraitFile(null);
  }

  async function save() {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    // #1286: read from the persisted draft, not a useState — createCharacter is
    // not idempotent, and a plain useState-held id would be lost on a page
    // refresh (CharacterDraft is persisted; component state is not), silently
    // reopening the orphan-and-duplicate bug this field exists to close.
    let id = draft.createdId;
    // Which of the three sequential calls below failed — the character exists
    // once "create" is behind us, and the error copy must say so.
    let step: "create" | "attach" | "upload" = "create";
    try {
      if (!id) {
        const payload = buildCreatePayload(
          draft,
          selections,
          skillChoices,
          toolChoices.selectedToolChoices
        );
        const created = await createCharacter(payload);
        id = created.id;
        update({ createdId: id });
      }
      // campaignId was resolved (and its edition inherited) at the
      // CreationEntryGate before the ceremony started; attach reuses the
      // existing join endpoint instead of adding a second creation-time mutation
      // path. Editions always match here (inherited, never re-picked), so this
      // never hits the join's edition-mismatch guard. Re-attaching the same
      // campaign is an idempotent no-op server-side, so a retry is safe.
      if (draft.campaignId) {
        step = "attach";
        await addCharacterToCampaign(id, draft.campaignId);
      }
      // #1616: the portrait upload rides the same retry template as the attach —
      // on failure, save() re-runs with draft.createdId set, skipping the
      // non-idempotent create and re-running the idempotent steps.
      if (portraitFile) {
        step = "upload";
        // Result discarded — navigate() triggers a fresh character fetch on the sheet.
        await uploadCharacterPortrait(id, portraitFile);
      }
      clear();
      // Replace (not push) so the now-stale empty form doesn't linger in history.
      navigate(`/characters/${id}`, { replace: true });
    } catch (err) {
      setSubmitError(
        step === "attach"
          ? `Character created, but couldn't join the campaign — ${errorMessage(err, "try again")}`
          : step === "upload"
            ? `Character created, but the portrait upload failed — ${errorMessage(err, "try again")}. Save again to retry, or finish and add it from the sheet's Story tab.`
            : errorMessage(err, "Couldn't save. Try again."),
      );
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
    speciesBonuses,
    catalog,
    portraitFile,
    setPortraitFile,
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
