// Pure step model for the level-up ceremony (#886) — step identity, labels, and
// Continue-gating. Rail-state math is shared in ceremonySteps. No JSX; consumed
// by useLevelUpCeremony / LevelUpCeremony (which build the rail via CeremonyStepRail).

import type { LevelUpStep, LevelUpStepKind, LevelUpSubmission } from "@/types/character";

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

// Draft entries that can satisfy a list step, by kind. subclassChoice narrows
// to its step's meta.key — several choose-N steps share the one draft array.
const LIST_ENTRIES: Partial<
  Record<LevelUpStepKind, (step: LevelUpStep, draft: LevelUpDraft) => readonly unknown[] | undefined>
> = {
  maneuvers: (_step, draft) => draft.maneuvers,
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
