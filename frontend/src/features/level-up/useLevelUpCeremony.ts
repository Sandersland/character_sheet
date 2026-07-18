// State machine for the level-up ceremony (#886): owns the served plan, the
// draft submission, and the position — which is keyed by stepKey (never index)
// so a subclass re-plan that inserts steps doesn't move the player.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { draftSatisfies, stepKey, type LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

export interface LevelUpCeremony {
  plan: LevelUpPlanResponse | null;
  planError: string | null;
  /** #1065: a non-primary target whose plan needs subclass/fightingStyle can't commit yet. */
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

export function useLevelUpCeremony(character: Character): LevelUpCeremony {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `?entry=` targets a specific class entry (multiclass); default is primary.
  const classEntryId = searchParams.get("entry") ?? character.classes?.[0]?.id ?? null;

  const [plan, setPlan] = useState<LevelUpPlanResponse | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  // hp seeded so a bare [hitPoints, review] plan confirms end-to-end; the real
  // HP step (#887) replaces this seed with the player's actual choice.
  const [draft, setDraft] = useState<LevelUpDraft>({ hp: { method: "average" } });
  const [currentKey, setCurrentKey] = useState("hitPoints");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refetch on a pending subclass pick — the server re-plans around it.
  const subclassId = draft.subclassId;
  useEffect(() => {
    if (!classEntryId) {
      setPlanError("This character has no class to level up.");
      return;
    }
    let mounted = true;
    fetchLevelUpPlan(character.id, { kind: "existing", classEntryId }, subclassId)
      .then((p) => {
        if (!mounted) return;
        setPlan(p);
        setPlanError(null);
      })
      .catch((e: unknown) => {
        if (mounted) setPlanError(e instanceof Error ? e.message : "Failed to fetch level-up plan");
      });
    return () => {
      mounted = false;
    };
  }, [character.id, classEntryId, subclassId]);

  const steps = plan?.steps ?? [];
  const found = steps.findIndex((step) => stepKey(step) === currentKey);
  const stepIndex = found === -1 ? 0 : found;
  const currentStep = steps[stepIndex] ?? null;

  const blocked =
    plan != null &&
    !plan.target.isPrimary &&
    steps.some((s) => s.kind === "subclass" || s.kind === "fightingStyle");

  const sheetPath = `/characters/${character.id}`;

  async function confirm(): Promise<void> {
    if (!classEntryId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitLevelUp(character.id, { target: { kind: "existing", classEntryId }, ...draft });
      navigate(sheetPath);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Failed to apply level-up");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    plan,
    planError,
    blocked,
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
    cancel: () => navigate(sheetPath),
    confirm,
    submitting,
    submitError,
  };
}
