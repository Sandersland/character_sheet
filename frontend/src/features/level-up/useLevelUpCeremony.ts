// State machine for the level-up ceremony (#886): composes the class-choice
// step, the plan fetch, and the submit into one API. Position is keyed by
// stepKey (never index) so a subclass re-plan that inserts steps doesn't move
// the player. Split into small sub-hooks (useClassChoice, useLevelAgain,
// useLevelUpPlan, useLevelUpSubmit) so each stays independently simple rather
// than piling every branch into one function.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { useReferenceData } from "@/hooks/useReferenceData";
import { errorMessage } from "@/lib/errorMessage";
import { stepPosition } from "@/lib/ceremonySteps";
import {
  buildClassChoiceOptions,
  selectableClassChoiceCount,
  type ClassChoiceOption,
} from "@/lib/levelUpClassChoice";
import { draftSatisfies, stepKey, type LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep, LevelUpTarget } from "@/types/character";

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

// Decides whether the ceremony needs the front-door class-choice step (#1170)
// and owns the player's pick once made. A guard-clause ladder (not nested
// branches) keeps this independently simple rather than inflating the parent.
function useClassChoice(
  character: Character,
  deepLinkTarget: LevelUpTarget | null,
): ClassChoiceResult & { resetChoice: () => void } {
  const { reference, error: referenceError } = useReferenceData();
  const classChoiceOptions = useMemo(
    () => buildClassChoiceOptions(character, reference?.classes),
    [character, reference],
  );
  const needsClassChoice = selectableClassChoiceCount(classChoiceOptions) > 1;
  // A character who already owns 2+ classes definitely needs the chooser —
  // that's known without reference data. Otherwise (single class today)
  // whether a *new* eligible class exists depends on reference — wait for it
  // to settle (loaded or errored) before committing to the fast auto-skip
  // path, or a late-arriving eligible class would yank the player out of an
  // already-started ready phase.
  const priorMulticlass = (character.classes?.length ?? 0) > 1;
  const decisionReady = priorMulticlass || reference != null || referenceError;

  const [chosenTarget, setChosenTarget] = useState<LevelUpTarget | null>(null);
  const resetChoice = () => setChosenTarget(null);

  if (!decisionReady) return { status: "deciding", target: null, classChoice: null, resetChoice };
  if (!needsClassChoice) return { status: "resolved", target: deepLinkTarget, classChoice: null, resetChoice };
  if (chosenTarget) return { status: "resolved", target: chosenTarget, classChoice: null, resetChoice };
  return {
    status: "choosing",
    target: null,
    classChoice: { options: classChoiceOptions, initialTarget: deepLinkTarget, onChoose: setChosenTarget },
    resetChoice,
  };
}

// Owns the "level up again" interstitial (#1170): a successful submit that
// leaves pendingLevelUps > 0 loops back to the chooser instead of leaving the
// ceremony (BG3-style per-level choice).
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

// Fetches the served plan, refetching when the pending subclass pick changes
// (the server re-plans around it). `skip` pauses fetching (and clears any prior
// plan) while the class-choice chooser or the "level up again" interstitial is
// showing — those own the screen and a stale plan/error must not race them.
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

// Owns the atomic commit: POSTs { target, ...draft } and reports the updated
// character back — the caller decides whether that means "done" or "one more
// pending level to loop through" (#1170).
function useLevelUpSubmit(
  characterId: string,
  target: LevelUpTarget | null,
  draft: LevelUpDraft,
  onSubmitted: (updated: Character) => void,
) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    if (!target || !draft.hp) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // #1131: one ceremony advances an existing class OR adds a first level in a
      // new one — the chooser (#1170) resolves target to either shape.
      const updated = await submitLevelUp(characterId, { ...draft, target, hp: draft.hp });
      onSubmitted(updated);
    } catch (e: unknown) {
      setSubmitError(errorMessage(e, "Failed to apply level-up"));
    } finally {
      setSubmitting(false);
    }
  }

  return { confirm, submitting, submitError };
}

export function useLevelUpCeremony(
  character: Character,
  onCharacterChange?: (updated: Character) => void,
): LevelUpCeremony {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // #1131/#1170: `?classId=` seeds a NEW class, `?entry=` seeds a specific
  // existing entry (defaulting to the primary) — both are now just the class
  // chooser's *initial* selection, not a bypass of it.
  const classIdParam = searchParams.get("classId");
  const entryParam = searchParams.get("entry");
  const primaryEntryId = character.classes?.[0]?.id ?? null;
  const deepLinkTarget = useMemo<LevelUpTarget | null>(() => {
    if (classIdParam) return { kind: "new", classId: classIdParam };
    const classEntryId = entryParam ?? primaryEntryId;
    return classEntryId ? { kind: "existing", classEntryId } : null;
  }, [classIdParam, entryParam, primaryEntryId]);

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

  function handleSubmitted(updated: Character): void {
    onCharacterChange?.(updated);
    reportSubmitted(updated);
  }
  const { confirm, submitting, submitError } = useLevelUpSubmit(character.id, choice.target, draft, handleSubmitted);

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
