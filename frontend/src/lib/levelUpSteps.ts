// Pure step model for the level-up ceremony rail (#886) — precedent: stepRail.
// No JSX; rendered by StepRail / LevelUpCeremony.

import type { LevelUpStep, LevelUpStepKind, LevelUpSubmission } from "@/types/character";

export type LevelUpStepState = "done" | "active" | "pending";

/** The in-progress submission minus its target (owned by useLevelUpCeremony). */
export type LevelUpDraft = Omit<LevelUpSubmission, "target">;

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
  advancement: "Ability Score",
  subclass: "Subclass",
  maneuvers: "Maneuvers",
  fightingStyle: "Fighting Style",
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

/**
 * Per-step rail state, index-aligned with `steps`. An unknown currentKey (the
 * current step vanished in a re-plan) falls back to the first step active.
 */
export function railState(steps: LevelUpStep[], currentKey: string): LevelUpStepState[] {
  const found = steps.findIndex((step) => stepKey(step) === currentKey);
  const current = found === -1 ? 0 : found;
  return steps.map((_, i) => (i < current ? "done" : i === current ? "active" : "pending"));
}

function listCount(step: LevelUpStep, draft: LevelUpDraft): number {
  switch (step.kind) {
    case "maneuvers":
      return draft.maneuvers?.length ?? 0;
    case "disciplines":
      return draft.disciplines?.length ?? 0;
    case "toolProficiency":
      return draft.toolProficiencies?.length ?? 0;
    case "subclassChoice":
      return (draft.subclassChoices ?? []).filter((c) => c.choiceKey === step.meta?.key).length;
    case "newSpells":
      return draft.spellsLearned?.length ?? 0;
    default:
      return 0;
  }
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
    case "fightingStyle":
      return draft.fightingStyle != null;
    case "review":
      return true;
    default:
      return listCount(step, draft) >= (step.count ?? 1);
  }
}
