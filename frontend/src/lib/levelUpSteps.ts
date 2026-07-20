// Pure step model for the level-up ceremony rail (#886) — precedent: stepRail.
// No JSX; rendered by StepRail / LevelUpCeremony.

import { railState as ceremonyRailState, stepPosition as ceremonyStepPosition } from "@/lib/ceremonySteps";
import type { CeremonyStepState } from "@/lib/ceremonySteps";
import type { LevelUpPlanResponse, LevelUpStep, LevelUpStepKind, LevelUpSubmission } from "@/types/character";

export type LevelUpStepState = CeremonyStepState;

// The in-progress submission minus its target (owned by useLevelUpCeremony). hp
// is optional here because the ceremony starts before the player picks it — the
// HitPointsStep (#887) sets it, and draftSatisfies gates Continue until it does.
export type LevelUpDraft = Omit<LevelUpSubmission, "target" | "hp"> & {
  hp?: LevelUpSubmission["hp"];
};

/**
 * Stable identity for a step across re-plans: kind, plus meta.key for the
 * repeatable subclassChoice kind. Tracking position by key (not index) keeps
 * the player on their step when a subclass pick inserts new steps.
 */
export function stepKey(step: LevelUpStep): string {
  const key = step.meta?.key;
  return typeof key === "string" ? `${step.kind}:${key}` : step.kind;
}

const STEP_LABELS: Record<LevelUpStepKind, string> = {
  hitPoints: "Hit Points",
  advancement: "Ability Score / Feat",
  subclass: "Subclass",
  maneuvers: "Maneuvers",
  fightingStyleFeat: "Fighting Style",
  disciplines: "Disciplines",
  toolProficiency: "Tool Proficiency",
  subclassChoice: "Subclass Choice",
  newSpells: "New Spells",
  review: "Review",
};

/** Display name for a step — subclassChoice steps carry theirs in meta.label. */
export function stepLabel(step: LevelUpStep): string {
  const label = step.meta?.label;
  if (step.kind === "subclassChoice" && typeof label === "string") return label;
  return STEP_LABELS[step.kind];
}

/** stepPosition over LevelUpStep[], keyed by stepKey — see ceremonySteps. */
export function stepPosition(steps: LevelUpStep[], currentKey: string): number {
  return ceremonyStepPosition(steps.map(stepKey), currentKey);
}

/** railState over LevelUpStep[], keyed by stepKey — see ceremonySteps. */
export function railState(steps: LevelUpStep[], currentKey: string): LevelUpStepState[] {
  return ceremonyRailState(steps.map(stepKey), currentKey);
}

// Mirror of the backend RESOURCE_BACKED set gating applyLevelUpTransaction:
// these picks derive their caps from the primary entry, so a non-primary plan
// containing them can't commit yet (#1065). This mirror must never be NARROWER
// than the backend guard, or users hit a raw 400 instead of the notice.
const RESOURCE_BACKED_KINDS: ReadonlySet<LevelUpStepKind> = new Set([
  "maneuvers",
  "disciplines",
  "toolProficiency",
  "subclassChoice",
]);

/** Whether the shell must show the #1065 notice instead of the stepper. */
export function ceremonyBlocked(plan: LevelUpPlanResponse | null): boolean {
  return plan != null && !plan.target.isPrimary && plan.steps.some((s) => RESOURCE_BACKED_KINDS.has(s.kind));
}

// Draft entries that can satisfy a list step, by kind. subclassChoice narrows
// to its step's meta.key — several choose-N steps share the one draft array.
const LIST_ENTRIES: Partial<
  Record<LevelUpStepKind, (step: LevelUpStep, draft: LevelUpDraft) => readonly unknown[] | undefined>
> = {
  maneuvers: (_step, draft) => draft.maneuvers,
  disciplines: (_step, draft) => draft.disciplines,
  toolProficiency: (_step, draft) => draft.toolProficiencies,
  subclassChoice: (step, draft) => draft.subclassChoices?.filter((c) => c.choiceKey === step.meta?.key),
  newSpells: (_step, draft) => draft.spellsLearned,
};

function listCount(step: LevelUpStep, draft: LevelUpDraft): number {
  return LIST_ENTRIES[step.kind]?.(step, draft)?.length ?? 0;
}

/**
 * Whether the draft carries enough to advance past `step` — the Continue gate.
 * Mirrors the server's per-step count check loosely (≥ count, not exact-match:
 * the server stays the authority on exactness at submit).
 */
export function draftSatisfies(step: LevelUpStep, draft: LevelUpDraft): boolean {
  switch (step.kind) {
    case "hitPoints":
      return draft.hp != null && (draft.hp.method !== "roll" || draft.hp.roll != null);
    case "advancement":
      return draft.advancement != null;
    case "subclass":
      return draft.subclassId != null;
    case "fightingStyleFeat":
      return draft.fightingStyleFeat != null;
    case "review":
      return true;
    case "newSpells": {
      // #1101: each swap forget must be offset by an extra learn, so the net
      // learn count must reach count + forgotten (count 0 with no swap is trivially met).
      const required = (step.count ?? 0) + (draft.spellsForgotten?.length ?? 0);
      // #1131: cantrips are picked separately and gate Continue on their own count.
      const cantrips = typeof step.meta?.cantrips === "number" ? step.meta.cantrips : 0;
      return listCount(step, draft) >= required && (draft.cantripsLearned?.length ?? 0) >= cantrips;
    }
    default:
      return listCount(step, draft) >= (step.count ?? 1);
  }
}
