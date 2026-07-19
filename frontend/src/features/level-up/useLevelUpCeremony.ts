// State machine for the level-up ceremony (#886): composes the plan fetch and
// the submit into one API. Position is keyed by stepKey (never index) so a
// subclass re-plan that inserts steps doesn't move the player.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { errorMessage } from "@/lib/errorMessage";
import { ceremonyBlocked, draftSatisfies, stepKey, stepPosition, type LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

export interface LevelUpCeremony {
  plan: LevelUpPlanResponse | null;
  planError: string | null;
  /** See ceremonyBlocked. */
  blocked: boolean;
  steps: LevelUpStep[];
  stepIndex: number;
  currentStep: LevelUpStep | null;
  currentKey: string;
  draft: LevelUpDraft;
  setDraft: React.Dispatch<React.SetStateAction<LevelUpDraft>>;
  canContinue: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  cancel: () => void;
  confirm: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

// Fetches the served plan, refetching when the pending subclass pick changes
// (the server re-plans around it).
function useLevelUpPlan(characterId: string, classEntryId: string | null, subclassId: string | undefined) {
  const [plan, setPlan] = useState<LevelUpPlanResponse | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!classEntryId) {
      setPlanError("This character has no class to level up.");
      return;
    }
    let mounted = true;
    fetchLevelUpPlan(characterId, { kind: "existing", classEntryId }, subclassId)
      .then((p) => {
        if (!mounted) return;
        setPlan(p);
        setPlanError(null);
      })
      .catch((e: unknown) => {
        if (mounted) setPlanError(errorMessage(e, "Failed to fetch level-up plan"));
      });
    return () => {
      mounted = false;
    };
  }, [characterId, classEntryId, subclassId]);

  return { plan, planError };
}

// Owns the atomic commit: POSTs { target, ...draft } and calls onDone on success.
function useLevelUpSubmit(characterId: string, classEntryId: string | null, draft: LevelUpDraft, onDone: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (!classEntryId || !draft.hp) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // The ceremony only advances an existing class; multiclassing-into a new
      // class stays on the interim AddClassPanel path until kind:"new" is wired here.
      await submitLevelUp(characterId, { ...draft, target: { kind: "existing", classEntryId }, hp: draft.hp });
      onDone();
    } catch (e: unknown) {
      setSubmitError(errorMessage(e, "Failed to apply level-up"));
    } finally {
      setSubmitting(false);
    }
  }

  return { confirm, submitting, submitError };
}

export function useLevelUpCeremony(character: Character): LevelUpCeremony {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `?entry=` targets a specific class entry (multiclass); default is primary.
  const classEntryId = searchParams.get("entry") ?? character.classes?.[0]?.id ?? null;

  const [draft, setDraft] = useState<LevelUpDraft>({});
  const [currentKey, setCurrentKey] = useState("hitPoints");

  const { plan, planError } = useLevelUpPlan(character.id, classEntryId, draft.subclassId);
  const goToSheet = () => navigate(`/characters/${character.id}`);
  const { confirm, submitting, submitError } = useLevelUpSubmit(character.id, classEntryId, draft, goToSheet);

  const steps = plan?.steps ?? [];
  const stepIndex = stepPosition(steps, currentKey);
  const currentStep = steps[stepIndex] ?? null;

  return {
    plan,
    planError,
    blocked: ceremonyBlocked(plan),
    steps,
    stepIndex,
    currentStep,
    currentKey,
    draft,
    setDraft,
    canContinue: currentStep != null && draftSatisfies(currentStep, draft),
    isLast: steps.length > 0 && stepIndex === steps.length - 1,
    next: () => {
      if (stepIndex < steps.length - 1) setCurrentKey(stepKey(steps[stepIndex + 1]));
    },
    back: () => {
      if (stepIndex > 0) setCurrentKey(stepKey(steps[stepIndex - 1]));
    },
    cancel: goToSheet,
    confirm,
    submitting,
    submitError,
  };
}
