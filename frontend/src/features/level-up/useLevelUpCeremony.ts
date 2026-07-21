// State machine for the level-up ceremony (#886): composes the plan fetch and
// the submit into one API. Position is keyed by stepKey (never index) so a
// subclass re-plan that inserts steps doesn't move the player.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { errorMessage } from "@/lib/errorMessage";
import { stepPosition } from "@/lib/ceremonySteps";
import { draftSatisfies, stepKey, type LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep, LevelUpTarget } from "@/types/character";

export interface LevelUpCeremony {
  plan: LevelUpPlanResponse | null;
  planError: string | null;
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
function useLevelUpPlan(characterId: string, target: LevelUpTarget | null, subclassId: string | undefined) {
  const [plan, setPlan] = useState<LevelUpPlanResponse | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setPlanError("This character has no class to level up.");
      return;
    }
    let mounted = true;
    fetchLevelUpPlan(characterId, target, subclassId)
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
  }, [characterId, target, subclassId]);

  return { plan, planError };
}

// Owns the atomic commit: POSTs { target, ...draft } and calls onDone on success.
function useLevelUpSubmit(characterId: string, target: LevelUpTarget | null, draft: LevelUpDraft, onDone: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (!target || !draft.hp) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // #1131: one ceremony advances an existing class OR adds a first level in a
      // new one — the ?classId= route resolves target to { kind: "new", classId }.
      await submitLevelUp(characterId, { ...draft, target, hp: draft.hp });
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
  // #1131: `?classId=` adds a first level in a NEW class; otherwise `?entry=`
  // targets a specific existing entry (multiclass), defaulting to the primary.
  const classIdParam = searchParams.get("classId");
  const entryParam = searchParams.get("entry");
  const primaryEntryId = character.classes?.[0]?.id ?? null;
  const target = useMemo<LevelUpTarget | null>(() => {
    if (classIdParam) return { kind: "new", classId: classIdParam };
    const classEntryId = entryParam ?? primaryEntryId;
    return classEntryId ? { kind: "existing", classEntryId } : null;
  }, [classIdParam, entryParam, primaryEntryId]);

  const [draft, setDraft] = useState<LevelUpDraft>({});
  const [currentKey, setCurrentKey] = useState("hitPoints");

  const { plan, planError } = useLevelUpPlan(character.id, target, draft.subclassId);
  const goToSheet = () => navigate(`/characters/${character.id}`);
  const { confirm, submitting, submitError } = useLevelUpSubmit(character.id, target, draft, goToSheet);

  const steps = plan?.steps ?? [];
  const stepIndex = stepPosition(steps.map(stepKey), currentKey);
  const currentStep = steps[stepIndex] ?? null;

  return {
    plan,
    planError,
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
