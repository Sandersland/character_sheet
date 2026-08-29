import type { LevelUpStep, LevelUpStepKind, LevelUpSubmission, LevelUpTarget } from "@/types/character";

// SubclassStep's re-pick stash: saved/restored per subclass id, invalidated by an actual subclass change. Spell fields stay OUT since a newSpells step is class-driven, not subclass-driven — that case is instead handled structurally by pruneDraftToPlan. Named once so applySubclassPick's stash-write and restore reads can't drift apart.
const SUBCLASS_DEPENDENT_KEYS = ["maneuvers", "toolProficiencies", "subclassChoices"] as const satisfies readonly (keyof LevelUpSubmission)[];

type SubclassDependentPicks = Pick<LevelUpSubmission, (typeof SUBCLASS_DEPENDENT_KEYS)[number]>;

// hp is optional here because the ceremony starts before the player picks it — draftSatisfies gates Continue until it does.
export type LevelUpDraft = Omit<LevelUpSubmission, "target" | "hp"> & {
  hp?: LevelUpSubmission["hp"];
  // Keyed by subclass id (globally unique — no multiclass collision risk); carried in the draft so resetForNextLevel's setDraft({}) clears it for free between levels.
  dependentPicksBySubclass?: Record<string, SubclassDependentPicks>;
};

// Stripped by levelUpSubmissionOf before the wire.
const CEREMONY_LOCAL_DRAFT_KEYS = ["dependentPicksBySubclass"] as const satisfies readonly (keyof LevelUpDraft)[];

// The endpoint's schema is a non-strict z.object, so an unstripped ceremony-local field would cross the wire and vanish silently — this is the only guard.
export function levelUpSubmissionOf(
  draft: LevelUpDraft,
  target: LevelUpTarget,
  hp: LevelUpSubmission["hp"],
): LevelUpSubmission {
  const rest: Partial<LevelUpDraft> = { ...draft };
  for (const key of CEREMONY_LOCAL_DRAFT_KEYS) delete rest[key];
  return { ...rest, target, hp } as LevelUpSubmission;
}

// target/hp are ceremony inputs, not staged picks; subclassId is pruneDraftToPlan's own input (useLevelUpPlan is keyed on it) so pruning it would be self-referential; subclassChoices gets per-entry pruning instead (see pruneDraftToPlan).
type PrunableDraftKey = Exclude<keyof LevelUpSubmission, "target" | "hp" | "subclassId" | "subclassChoices">;

// Maps each prunable draft field to the step kind that licenses it, mirroring the server's assertNoExcess sweep. The exhaustive Record is load-bearing: a new LevelUpSubmission field with no entry here is a compile error.
const PRUNABLE_DRAFT_KEYS = {
  advancement: "advancement",
  fightingStyleFeat: "fightingStyleFeat",
  maneuvers: "maneuvers",
  toolProficiencies: "toolProficiency",
  expertise: "expertise",
  spellsLearned: "newSpells",
  cantripsLearned: "newSpells",
  spellsForgotten: "newSpells",
} as const satisfies Record<PrunableDraftKey, LevelUpStepKind>;

// Drops any op-bearing draft field whose licensing step is absent from `steps` (the served plan) — mirrors the server's assertNoExcess/assertCantrips/assertForgets sweep client-side, without moving the trust boundary. subclassChoices is pruned per-entry instead: an entry survives only if its choiceKey matches a subclassChoice step's meta.key in this same plan. Returns the input draft by reference when nothing is pruned, since the caller is a setDraft inside an effect keyed on plan identity.
export function pruneDraftToPlan(draft: LevelUpDraft, steps: LevelUpStep[]): LevelUpDraft {
  const kinds = new Set(steps.map((s) => s.kind));
  const droppedKeys = (Object.keys(PRUNABLE_DRAFT_KEYS) as PrunableDraftKey[]).filter(
    (key) => draft[key] !== undefined && !kinds.has(PRUNABLE_DRAFT_KEYS[key]),
  );

  const allowedChoiceKeys = new Set(
    steps.filter((s) => s.kind === "subclassChoice").map((s) => s.meta?.key).filter((k) => typeof k === "string"),
  );
  const survivingChoices = draft.subclassChoices?.filter((c) => allowedChoiceKeys.has(c.choiceKey));
  const choicesChanged = (draft.subclassChoices?.length ?? 0) !== (survivingChoices?.length ?? 0);

  if (droppedKeys.length === 0 && !choicesChanged) return draft;

  const rest: Partial<LevelUpDraft> = { ...draft };
  for (const key of droppedKeys) delete rest[key];
  // Only rewrite subclassChoices when it actually changed, to avoid a gratuitous identity change that could falsely invalidate a memo keyed on this field.
  if (choicesChanged) {
    if (survivingChoices?.length) rest.subclassChoices = survivingChoices;
    else delete rest.subclassChoices;
  }
  return rest as LevelUpDraft;
}

function subclassDependentPicksOf(source: LevelUpDraft | SubclassDependentPicks | undefined): SubclassDependentPicks {
  const result: Record<string, unknown> = {};
  for (const key of SUBCLASS_DEPENDENT_KEYS) result[key] = source?.[key];
  return result as SubclassDependentPicks;
}

// Stashes the outgoing subclass's dependent picks under its id before clearing them, and restores the incoming subclass's bucket if one was stashed earlier this ceremony. Keyed by subclass id (globally unique across classes), so a bucket can only ever be restored into the exact plan it was authored under. The identity guard below must stay — useRovingRadioGroup can still invoke this on a click of the already-checked card.
export function applySubclassPick(draft: LevelUpDraft, subclassId: string): LevelUpDraft {
  if (draft.subclassId === subclassId) return draft;

  const nextStash = { ...(draft.dependentPicksBySubclass ?? {}) };
  if (draft.subclassId != null) nextStash[draft.subclassId] = subclassDependentPicksOf(draft);

  // Every dependent key is written here, even when the incoming bucket is absent or partial, so the OUTGOING subclass's picks can never linger on the incoming one.
  const restoredFields = subclassDependentPicksOf(nextStash[subclassId]);

  return { ...draft, subclassId, ...restoredFields, dependentPicksBySubclass: nextStash };
}

// Tracking position by key (not index) keeps the player on their step when a subclass pick inserts new steps.
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
  expertise: "Expertise",
  subclassChoice: "Subclass Choice",
  newSpells: "New Spells",
  review: "Review",
};

export function stepLabel(step: LevelUpStep): string {
  const label = step.meta?.label;
  if (step.kind === "subclassChoice" && typeof label === "string") return label;
  return STEP_LABELS[step.kind];
}

// subclassChoice narrows to its step's meta.key — several choose-N steps share the one draft array.
const LIST_ENTRIES: Partial<
  Record<LevelUpStepKind, (step: LevelUpStep, draft: LevelUpDraft) => readonly unknown[] | undefined>
> = {
  maneuvers: (_step, draft) => draft.maneuvers,
  toolProficiency: (_step, draft) => draft.toolProficiencies,
  expertise: (_step, draft) => draft.expertise,
  subclassChoice: (step, draft) => draft.subclassChoices?.filter((c) => c.choiceKey === step.meta?.key),
  newSpells: (_step, draft) => draft.spellsLearned,
};

function listCount(step: LevelUpStep, draft: LevelUpDraft): number {
  return LIST_ENTRIES[step.kind]?.(step, draft)?.length ?? 0;
}

// Mirrors the server's per-step count check loosely (≥ count, not exact-match: the server stays the authority on exactness at submit).
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
      // Each swap forget must be offset by an extra learn, so the net learn count must reach count + forgotten.
      const required = (step.count ?? 0) + (draft.spellsForgotten?.length ?? 0);
      // Cantrips are picked separately and gate Continue on their own count.
      const cantrips = typeof step.meta?.cantrips === "number" ? step.meta.cantrips : 0;
      return listCount(step, draft) >= required && (draft.cantripsLearned?.length ?? 0) >= cantrips;
    }
    default:
      return listCount(step, draft) >= (step.count ?? 1);
  }
}
