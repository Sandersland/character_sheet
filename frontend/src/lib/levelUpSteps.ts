// Pure step model for the level-up ceremony (#886) — step identity, labels, and
// Continue-gating. Rail-state math is shared in ceremonySteps. No JSX; consumed
// by useLevelUpCeremony / LevelUpCeremony (which build the rail via CeremonyStepRail).

import type { LevelUpStep, LevelUpStepKind, LevelUpSubmission, LevelUpTarget } from "@/types/character";

// Fields SubclassStep's re-pick stash (#1323) saves/restores per subclass id —
// invalidated by an actual subclass change. The spell fields (spellsLearned/
// cantripsLearned/spellsForgotten) deliberately stay OUT: a newSpells step is
// class-driven (all six full casters get one at a spell-granting level
// regardless of subclass), so stashing them per subclass would discard a
// Wizard's still-valid picks on an Evocation→Abjuration switch. The
// Eldritch-Knight case (a subclass switch that retires the newSpells step
// entirely) is instead handled structurally by pruneDraftToPlan (#1421).
// Named once so applySubclassPick's stash-write and restore reads can't drift
// apart.
const SUBCLASS_DEPENDENT_KEYS = ["maneuvers", "toolProficiencies", "subclassChoices"] as const satisfies readonly (keyof LevelUpSubmission)[];

type SubclassDependentPicks = Pick<LevelUpSubmission, (typeof SUBCLASS_DEPENDENT_KEYS)[number]>;

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

// Every op-bearing LevelUpSubmission key except the three pruneDraftToPlan
// never touches: target/hp are ceremony inputs, not staged picks; subclassId
// is the prune's own input (useLevelUpPlan is keyed on it) so pruning it would
// be self-referential. dependentPicksBySubclass (the #1323 stash) is on
// LevelUpDraft, not LevelUpSubmission, so it can never appear here — that's
// what keeps it un-prunable by construction, not by a runtime check.
type PrunableDraftKey = Exclude<keyof LevelUpSubmission, "target" | "hp" | "subclassId" | "subclassChoices">;

// Maps each prunable draft field to the step kind that licenses it, mirroring
// the server's assertNoExcess sweep (level-up-submission.ts) client-side. The
// exhaustive Record (not Partial<Record<...>>) is load-bearing: a new
// LevelUpSubmission field with no entry here is a compile error, forcing a
// classification decision instead of a silent gap. toolProficiencies (plural
// field) is licensed by the singular step kind toolProficiency.
const PRUNABLE_DRAFT_KEYS = {
  advancement: "advancement",
  fightingStyleFeat: "fightingStyleFeat",
  maneuvers: "maneuvers",
  toolProficiencies: "toolProficiency",
  spellsLearned: "newSpells",
  cantripsLearned: "newSpells",
  spellsForgotten: "newSpells",
} as const satisfies Record<PrunableDraftKey, LevelUpStepKind>;

/**
 * Drops any op-bearing draft field whose licensing step is absent from
 * `steps` (the served plan). A subclass switch can retire a step while its
 * picks still sit in the draft (e.g. Eldritch Knight → Champion leaves
 * spellsLearned staged with no newSpells step to grant it) — left unpruned,
 * the Review ledger (buildLevelUpLedger) enumerates spells the character
 * never gets, and confirm 400s on the server's assertNoExcess/assertCantrips/
 * assertForgets. This mirrors that server sweep client-side without moving
 * the trust boundary: the server is still the sole authority on validity,
 * this just stops staging work it will reject.
 *
 * subclassChoices is pruned per-entry (not all-or-nothing): an entry survives
 * only if its choiceKey matches the meta.key of a subclassChoice step
 * present in this same plan — several such steps can coexist (a Hunter
 * Ranger's tiers), each writing to the one shared array (see
 * choiceConfigForStep, #1422).
 *
 * Returns the input draft by reference when nothing is pruned — the caller
 * is a setDraft inside an effect keyed on plan identity, and an always-new
 * object would force a render on every plan fetch even when nothing changed.
 */
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
  if (survivingChoices?.length) rest.subclassChoices = survivingChoices;
  else delete rest.subclassChoices;
  return rest as LevelUpDraft;
}

function subclassDependentPicksOf(source: LevelUpDraft | SubclassDependentPicks | undefined): SubclassDependentPicks {
  const result: Record<string, unknown> = {};
  for (const key of SUBCLASS_DEPENDENT_KEYS) result[key] = source?.[key];
  return result as SubclassDependentPicks;
}

/**
 * SubclassStep's pick handler (#1323): stashes the outgoing subclass's
 * dependent picks (maneuvers/toolProficiencies/subclassChoices) under its id
 * before clearing them, and restores the incoming subclass's bucket if one
 * was stashed earlier this ceremony. Keyed by subclass id rather than plan
 * position: subclass ids are DB ids (globally unique across classes), so a
 * bucket can only ever be restored into the exact plan it was authored
 * under — no multiclass collision risk (see the #1323 plan, F8).
 *
 * The re-selected-subclass identity guard (returning `draft` unchanged) must
 * stay — useRovingRadioGroup can still invoke this on a click of the already-
 * checked card, and it's also what keeps a no-op pick from re-rendering.
 */
export function applySubclassPick(draft: LevelUpDraft, subclassId: string): LevelUpDraft {
  if (draft.subclassId === subclassId) return draft;

  const nextStash = { ...(draft.dependentPicksBySubclass ?? {}) };
  if (draft.subclassId != null) nextStash[draft.subclassId] = subclassDependentPicksOf(draft);

  // Every dependent key is written here, even when the incoming bucket is
  // absent or partial — a sparse spread of the bucket would leave the
  // OUTGOING subclass's picks sitting on the incoming one (the exact
  // reverse-regression this function exists to prevent).
  const restoredFields = subclassDependentPicksOf(nextStash[subclassId]);

  return { ...draft, subclassId, ...restoredFields, dependentPicksBySubclass: nextStash };
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
