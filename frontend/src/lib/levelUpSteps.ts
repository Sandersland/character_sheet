// Pure step model for the level-up ceremony (#886) — step identity, labels, and
// Continue-gating. Rail-state math is shared in ceremonySteps. No JSX; consumed
// by useLevelUpCeremony / LevelUpCeremony (which build the rail via CeremonyStepRail).

import type { LevelUpStep, LevelUpStepKind, LevelUpSubmission, LevelUpTarget } from "@/types/character";

// Fields SubclassStep's re-pick stash (#1323, added by applySubclassPick
// below) saves/restores per subclass id — invalidated by an actual subclass
// change, so kept separate from the fields that survive one (e.g.
// spellsLearned, F5 in the #1323 plan — a known, out-of-scope leak).
type SubclassDependentPicks = Pick<LevelUpSubmission, "maneuvers" | "toolProficiencies" | "subclassChoices">;

// The in-progress submission minus its target (owned by useLevelUpCeremony). hp
// is optional here because the ceremony starts before the player picks it — the
// HitPointsStep (#887) sets it, and draftSatisfies gates Continue until it does.
export type LevelUpDraft = Omit<LevelUpSubmission, "target" | "hp"> & {
  hp?: LevelUpSubmission["hp"];
  // #1323: SubclassStep's re-pick stash, keyed by subclass id so a bucket can
  // only ever be restored into the exact plan it was authored under (subclass
  // ids are DB ids, globally unique — no multiclass collision risk). Ceremony-
  // local: carried in the draft (not ceremony-level state) purely so
  // resetForNextLevel's setDraft({}) clears it for free between levels — see
  // levelUpSubmissionOf for why it must never reach the wire.
  dependentPicksBySubclass?: Record<string, SubclassDependentPicks>;
};

// Draft keys that exist only to drive the ceremony UI and have no counterpart
// in LevelUpSubmission — stripped by levelUpSubmissionOf before the wire.
const CEREMONY_LOCAL_DRAFT_KEYS = ["dependentPicksBySubclass"] as const satisfies readonly (keyof LevelUpDraft)[];

/**
 * Builds the POST /level-up/transactions body from the ceremony draft. The
 * endpoint's schema is a non-strict z.object, so an unstripped ceremony-local
 * field wouldn't be rejected — it would cross the wire and vanish silently,
 * with no 400 and no type error (spreads get no excess-property checking).
 * This is the only guard.
 */
export function levelUpSubmissionOf(
  draft: LevelUpDraft,
  target: LevelUpTarget,
  hp: LevelUpSubmission["hp"],
): LevelUpSubmission {
  const rest: Partial<LevelUpDraft> = { ...draft };
  for (const key of CEREMONY_LOCAL_DRAFT_KEYS) delete rest[key];
  return { ...rest, target, hp } as LevelUpSubmission;
}

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
