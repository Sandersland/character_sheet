// Position is keyed by stepKey, never index, so a subclass re-plan that inserts steps doesn't move the player.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { useReferenceData } from "@/hooks/useReferenceData";
import { errorMessage } from "@/lib/errorMessage";
import { stepPosition } from "@/lib/ceremonySteps";
import {
  buildClassChoiceOptions,
  resolveAutoSkipTarget,
  selectableClassChoiceCount,
  type ClassChoiceOption,
} from "@/lib/levelUpClassChoice";
import { draftSatisfies, levelUpSubmissionOf, pruneDraftToPlan, stepKey, type LevelUpDraft } from "@/lib/levelUpSteps";
import type {
  Character,
  LevelUpPlanResponse,
  LevelUpStep,
  LevelUpSubmission,
  LevelUpTarget,
} from "@/types/character";

/** The chooser step at ceremony start (#1170) — non-null while awaiting a pick. */
export interface ClassChoicePhase {
  options: ClassChoiceOption[];
  initialTarget: LevelUpTarget | null;
  onChoose: (target: LevelUpTarget) => void;
}

/** The "level up again" interstitial (#1170) — shown when more levels are pending. */
export interface LevelAgainPhase {
  remaining: number;
  onContinue: () => void;
  onFinish: () => void;
}

export interface LevelUpCeremony {
  classChoice: ClassChoicePhase | null;
  levelAgain: LevelAgainPhase | null;
  target: LevelUpTarget | null;
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

type ClassChoiceResult =
  | { status: "deciding"; target: null; classChoice: null }
  | { status: "choosing"; target: null; classChoice: ClassChoicePhase }
  | { status: "resolved"; target: LevelUpTarget | null; classChoice: null };

function useClassChoice(
  character: Character,
  deepLinkTarget: LevelUpTarget | null,
): ClassChoiceResult & { resetChoice: () => void } {
  const { reference, error: referenceError } = useReferenceData(character.rulesEdition);
  const classChoiceOptions = useMemo(
    () => buildClassChoiceOptions(character, reference?.classes),
    [character, reference],
  );
  const needsClassChoice = selectableClassChoiceCount(classChoiceOptions) > 1;
  // Wait for reference to settle before auto-skipping the single-class case — otherwise a late-arriving eligible class would yank the player out of an already-started ready phase.
  const priorMulticlass = (character.classes?.length ?? 0) > 1;
  const decisionReady = priorMulticlass || reference != null || referenceError;

  const [chosenTarget, setChosenTarget] = useState<LevelUpTarget | null>(null);
  const resetChoice = () => setChosenTarget(null);

  if (!decisionReady) return { status: "deciding", target: null, classChoice: null, resetChoice };
  if (!needsClassChoice) {
    const target = resolveAutoSkipTarget(deepLinkTarget, classChoiceOptions);
    return { status: "resolved", target, classChoice: null, resetChoice };
  }
  if (chosenTarget) return { status: "resolved", target: chosenTarget, classChoice: null, resetChoice };
  return {
    status: "choosing",
    target: null,
    classChoice: { options: classChoiceOptions, initialTarget: deepLinkTarget, onChoose: setChosenTarget },
    resetChoice,
  };
}

function useLevelAgain(goToSheet: () => void, resetForNextLevel: () => void) {
  const [remaining, setRemaining] = useState<number | null>(null);

  function reportSubmitted(updated: Character): void {
    if (updated.pendingLevelUps > 0) setRemaining(updated.pendingLevelUps);
    else goToSheet();
  }

  const levelAgain: LevelAgainPhase | null =
    remaining == null
      ? null
      : {
          remaining,
          onContinue: () => {
            setRemaining(null);
            resetForNextLevel();
          },
          onFinish: goToSheet,
        };

  return { levelAgain, reportSubmitted };
}

// Deliberate-coupling latch: deps must stay exactly [plan, setDraft] — never [plan.steps] (re-prunes every render, eating the #1323 stash restore) or [plan, draft] (draft is what this writes).
// Guards plan == null: useLevelUpPlan clears plan while the class chooser/level-again interstitial own the screen, and pruning against the empty-steps fallback would wipe the entire draft.
function usePruneDraftToPlan(
  plan: LevelUpPlanResponse | null,
  setDraft: React.Dispatch<React.SetStateAction<LevelUpDraft>>,
): void {
  useEffect(() => {
    if (plan == null) return;
    setDraft((d) => pruneDraftToPlan(d, plan.steps));
  }, [plan, setDraft]);
}

// `skip` pauses fetching (and clears any prior plan) while the class-choice chooser or the level-again interstitial is showing — those own the screen and a stale plan/error must not race them.
function useLevelUpPlan(
  characterId: string,
  target: LevelUpTarget | null,
  subclassId: string | undefined,
  skip: boolean,
) {
  const [plan, setPlan] = useState<LevelUpPlanResponse | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (skip) {
      setPlan(null);
      setPlanError(null);
      return;
    }
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
  }, [characterId, target, subclassId, skip]);

  return { plan, planError };
}

function useLevelUpSubmit(
  characterId: string,
  target: LevelUpTarget | null,
  draft: LevelUpDraft,
  onSubmitted: (updated: Character) => void,
) {
  const mutation = useCharacterMutation({
    characterId,
    mutationFn: (submission: LevelUpSubmission) => submitLevelUp(characterId, submission),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to apply level-up",
    onCharacterWritten: onSubmitted,
  });

  async function confirm(): Promise<void> {
    if (!target || !draft.hp) return;
    try {
      // #1131: target is either an existing class entry or a first level in a new class — the chooser (#1170) resolves it to either shape.
      await mutation.mutateAsync(levelUpSubmissionOf(draft, target, draft.hp));
    } catch {
      // mutation.error already carries the message.
    }
  }

  return { confirm, submitting: mutation.isPending, submitError: mutation.error };
}

// `?classId=` seeds a new class, `?entry=` seeds a specific existing entry (defaulting to the primary) — both are just the class chooser's initial selection, not a bypass of it.
function useDeepLinkTarget(character: Character): LevelUpTarget | null {
  const [searchParams] = useSearchParams();
  const classIdParam = searchParams.get("classId");
  const entryParam = searchParams.get("entry");
  const primaryEntryId = character.classes?.[0]?.id ?? null;
  return useMemo<LevelUpTarget | null>(() => {
    if (classIdParam) return { kind: "new", classId: classIdParam };
    const classEntryId = entryParam ?? primaryEntryId;
    return classEntryId ? { kind: "existing", classEntryId } : null;
  }, [classIdParam, entryParam, primaryEntryId]);
}

export function useLevelUpCeremony(character: Character): LevelUpCeremony {
  const navigate = useNavigate();
  const deepLinkTarget = useDeepLinkTarget(character);
  const choice = useClassChoice(character, deepLinkTarget);

  const [draft, setDraft] = useState<LevelUpDraft>({});
  const [currentKey, setCurrentKey] = useState("hitPoints");
  const goToSheet = () => navigate(`/characters/${character.id}`);

  function resetForNextLevel() {
    choice.resetChoice();
    setDraft({});
    setCurrentKey("hitPoints");
  }
  const { levelAgain, reportSubmitted } = useLevelAgain(goToSheet, resetForNextLevel);

  const skipPlan = choice.status !== "resolved" || levelAgain != null;
  const { plan, planError } = useLevelUpPlan(character.id, choice.target, draft.subclassId, skipPlan);
  usePruneDraftToPlan(plan, setDraft);

  const { confirm, submitting, submitError } = useLevelUpSubmit(character.id, choice.target, draft, reportSubmitted);

  const steps = plan?.steps ?? [];
  const stepIndex = stepPosition(steps.map(stepKey), currentKey);
  const currentStep = steps[stepIndex] ?? null;

  return {
    classChoice: choice.classChoice,
    levelAgain,
    target: choice.target,
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
