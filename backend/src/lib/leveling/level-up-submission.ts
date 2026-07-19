// Pure validator for a unified level-up submission (#885): given a character
// snapshot, the target class entry after the level, and a structured submission,
// it derives the authoritative ordered steps via buildLevelUpPlan and asserts the
// submission matches them exactly. No DB, no Prisma — the caller resolves any
// subclass id → name before calling. Later tasks wire the endpoint that applies
// the returned steps.
import type { AdvancementOperation, TakeFeatOperation } from "@/lib/leveling/advancement.js";
import type { LevelUpTarget } from "@/lib/combat/hp-operations.js";
import type {
  LearnManeuverOperation,
  LearnDisciplineOperation,
  LearnToolProficiencyOperation,
  LearnSubclassChoiceOperation,
} from "@/lib/classes/resources.js";
import type { ForgetSpellOperation, LearnSpellOperation } from "@/lib/spellcasting/spellcasting.js";
import {
  buildLevelUpPlan,
  type LevelUpPlanCharacter,
  type LevelUpStep,
  type LevelUpStepKind,
  type TargetClassEntry,
} from "./level-up-plan.js";

// Untyped status → the transactions-endpoint scaffold defaults domain errors to
// 400 (the #1007 typed-error system), so no `status` field here.
export class InvalidLevelUpError extends Error {}

/**
 * The domain-side level-up submission. Op payloads reuse the exact op types their
 * domains already export (takeAsi/takeFeat only for `advancement`); zod validation
 * lives in the route, not here. `target`/`subclassId` carry the raw ids the caller
 * resolves before validation.
 */
export interface LevelUpSubmission {
  target: LevelUpTarget;
  hp: { method: "average" | "roll"; roll?: number };
  advancement?: AdvancementOperation;
  subclassId?: string;
  // #1137: a Fighting Style feat pick — a takeFeat op; the transaction forces
  // slot:"fightingStyle" server-side so it lands in the fs partition.
  fightingStyleFeat?: TakeFeatOperation;
  maneuvers?: LearnManeuverOperation[];
  disciplines?: LearnDisciplineOperation[];
  toolProficiencies?: LearnToolProficiencyOperation[];
  subclassChoices?: LearnSubclassChoiceOperation[];
  spellsLearned?: LearnSpellOperation[];
  // #1131: new cantrips picked this level — counted against the newSpells step's
  // meta.cantrips, separately from leveled picks (a cantrip never offsets a swap).
  cantripsLearned?: LearnSpellOperation[];
  // #1101/#1127: an optional prepared-spell swap — one forgotten entry offset by
  // one extra learn (net count still equals the newSpells step's count).
  spellsForgotten?: ForgetSpellOperation[];
}

// Canonical step order — mirrors the candidates array in buildLevelUpPlan. The
// subclass step is spliced back at this rank after a re-plan (which omits it).
const KIND_ORDER: LevelUpStepKind[] = [
  "hitPoints", "advancement", "subclass", "maneuvers", "fightingStyleFeat",
  "disciplines", "toolProficiency", "subclassChoice", "newSpells", "review",
];

// One count-checkable submission domain that maps 1:1 to a plan step kind.
// `subclass` and `subclassChoice` are handled specially (below) and excluded.
interface SimpleDomain {
  kind: Exclude<LevelUpStepKind, "subclass" | "subclassChoice" | "review">;
  provided: (s: LevelUpSubmission) => number;
  noun: string;        // for "expected N <noun> for this level-up, got M"
  absentMessage: string; // for the reverse-sweep excess check
}

const SIMPLE_DOMAINS: SimpleDomain[] = [
  { kind: "hitPoints", provided: () => 1, noun: "hit point roll", absentMessage: "this level-up does not include hit points" },
  { kind: "advancement", provided: (s) => (s.advancement ? 1 : 0), noun: "advancement", absentMessage: "this level-up does not include an ability score improvement or feat" },
  { kind: "fightingStyleFeat", provided: (s) => (s.fightingStyleFeat ? 1 : 0), noun: "fighting style", absentMessage: "this level-up does not include a fighting style choice" },
  { kind: "maneuvers", provided: (s) => s.maneuvers?.length ?? 0, noun: "maneuvers", absentMessage: "this level-up does not grant maneuvers" },
  { kind: "disciplines", provided: (s) => s.disciplines?.length ?? 0, noun: "disciplines", absentMessage: "this level-up does not grant disciplines" },
  { kind: "toolProficiency", provided: (s) => s.toolProficiencies?.length ?? 0, noun: "tool proficiencies", absentMessage: "this level-up does not grant a tool proficiency" },
  { kind: "newSpells", provided: (s) => s.spellsLearned?.length ?? 0, noun: "new spells", absentMessage: "this level-up does not grant new spells" },
];

// Splice a subclass step back into a re-planned list at its canonical rank
// (after advancement/hitPoints, before maneuvers). The list is already ordered,
// so insert before the first step ranked after `subclass`.
function insertSubclassStep(plan: LevelUpStep[]): LevelUpStep[] {
  const subclassRank = KIND_ORDER.indexOf("subclass");
  const at = plan.findIndex((step) => KIND_ORDER.indexOf(step.kind) > subclassRank);
  const idx = at === -1 ? plan.length : at;
  return [...plan.slice(0, idx), { kind: "subclass" }, ...plan.slice(idx)];
}

/**
 * Resolve the plan, honoring the re-plan contract (see buildLevelUpPlan
 * docstring): when the base plan surfaces a subclass step AND a subclass is
 * chosen, the plan is rebuilt for that subclass (its subclass-derived choices
 * can't exist until then) and the subclass step re-inserted. With no chosen
 * subclass the base plan is returned as-is — the ceremony (#886) serves it so
 * the player can make the subclass pick, then re-requests the plan.
 */
export function resolveLevelUpPlan(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
): LevelUpStep[] {
  const basePlan = buildLevelUpPlan(character, target);
  if (!chosenSubclassName || !basePlan.some((step) => step.kind === "subclass")) {
    return basePlan;
  }
  const replan = buildLevelUpPlan(character, { ...target, subclass: chosenSubclassName });
  return insertSubclassStep(replan);
}

// Submission-coupled wrapper: the plan must agree with the subclass presence in
// the submission before counts are checked.
function resolveEffectivePlan(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
  submission: LevelUpSubmission,
): LevelUpStep[] {
  const plan = resolveLevelUpPlan(character, target, chosenSubclassName);
  const needsSubclass = plan.some((step) => step.kind === "subclass");
  if (needsSubclass && !chosenSubclassName) {
    throw new InvalidLevelUpError("this level-up requires choosing a subclass");
  }
  if (!needsSubclass && submission.subclassId) {
    throw new InvalidLevelUpError("this level-up does not include a subclass choice");
  }
  return plan;
}

// Per-step count check: every plan step (except review) must be matched by the
// exact number of submitted entries. subclassChoice is checked per `meta.key`.
function assertCounts(plan: LevelUpStep[], chosenSubclassName: string | null, submission: LevelUpSubmission): void {
  for (const step of plan) {
    if (step.kind === "review") continue;
    const expected = step.count ?? 1;
    const { provided, noun } = stepProvided(step, chosenSubclassName, submission);
    if (provided !== expected) {
      // A negative net only happens when a swap forget outnumbers the learns.
      if (provided < 0) {
        throw new InvalidLevelUpError("You must learn a replacement spell for every spell you swap out.");
      }
      throw new InvalidLevelUpError(`expected ${expected} ${noun} for this level-up, got ${provided}`);
    }
  }
}

// #1101: learns net of the one optional swap forget.
function netSpellsLearned(submission: LevelUpSubmission): number {
  return (submission.spellsLearned?.length ?? 0) - (submission.spellsForgotten?.length ?? 0);
}

function stepProvided(
  step: LevelUpStep,
  chosenSubclassName: string | null,
  submission: LevelUpSubmission,
): { provided: number; noun: string } {
  if (step.kind === "subclass") {
    return { provided: chosenSubclassName ? 1 : 0, noun: "subclass" };
  }
  if (step.kind === "subclassChoice") {
    const key = step.meta?.key;
    const provided = (submission.subclassChoices ?? []).filter((c) => c.choiceKey === key).length;
    return { provided, noun: `${String(key)} choices` };
  }
  // #1101: a swap offsets its extra learn — the NET learn count must equal the
  // step count (spellsLearned.length === step.count + spellsForgotten.length).
  if (step.kind === "newSpells") {
    return { provided: netSpellsLearned(submission), noun: "new spells" };
  }
  const domain = SIMPLE_DOMAINS.find((d) => d.kind === step.kind)!;
  return { provided: domain.provided(submission), noun: domain.noun };
}

// Reverse sweep: any populated submission field with no matching plan step is
// excess and rejected (the count check only visits fields the plan expects).
// spellsForgotten is absent from SIMPLE_DOMAINS by design — assertForgets
// rejects stray forgets with the swap-specific message.
function assertNoExcess(plan: LevelUpStep[], submission: LevelUpSubmission): void {
  const kinds = new Set(plan.map((s) => s.kind));
  for (const domain of SIMPLE_DOMAINS) {
    if (!kinds.has(domain.kind) && domain.provided(submission) > 0) {
      throw new InvalidLevelUpError(domain.absentMessage);
    }
  }
  const allowedChoiceKeys = new Set(
    plan.filter((s) => s.kind === "subclassChoice").map((s) => s.meta?.key),
  );
  for (const choice of submission.subclassChoices ?? []) {
    if (!allowedChoiceKeys.has(choice.choiceKey)) {
      throw new InvalidLevelUpError(`this level-up does not include a "${choice.choiceKey}" choice`);
    }
  }
}

// #1101/#1127: a legal swap target is a user-learned (source null) leveled spell —
// not a cantrip (level 0) or a granted/item spell (source set).
function isSwappableEntry(entry: NonNullable<LevelUpPlanCharacter["spellEntries"]>[number] | undefined): boolean {
  return entry != null && entry.level > 0 && entry.source == null;
}

// #1127: a swap forgets exactly one user-learned leveled spell, only on a
// newSpells step that carries meta.canSwap (onLevelUp-cadence casters). A
// missing/non-swap step throws the same way, so a re-prepare or non-caster level
// rejects a stray forget too.
function assertForgets(plan: LevelUpStep[], character: LevelUpPlanCharacter, submission: LevelUpSubmission): void {
  const forgets = submission.spellsForgotten ?? [];
  if (forgets.length === 0) return;
  if (forgets.length > 1) {
    throw new InvalidLevelUpError("You may swap at most one prepared spell per level-up.");
  }
  const step = plan.find((s) => s.kind === "newSpells");
  if (step?.meta?.canSwap !== true) {
    throw new InvalidLevelUpError("this level-up does not allow swapping a prepared spell");
  }
  const entries = character.spellEntries ?? [];
  for (const op of forgets) {
    if (!isSwappableEntry(entries.find((e) => e.id === op.entryId))) {
      throw new InvalidLevelUpError(`Cannot swap that spell: ${op.entryId} is not a swappable prepared spell.`);
    }
  }
}

// #1131: new cantrips ride the newSpells step's meta.cantrips, counted separately
// from leveled picks (a cantrip never offsets a swap forget). A level with no
// newSpells step — or one granting no cantrips — rejects any cantripsLearned.
function assertCantrips(plan: LevelUpStep[], submission: LevelUpSubmission): void {
  const step = plan.find((s) => s.kind === "newSpells");
  const expected = typeof step?.meta?.cantrips === "number" ? step.meta.cantrips : 0;
  const provided = submission.cantripsLearned?.length ?? 0;
  if (provided === expected) return;
  if (!step || expected === 0) {
    throw new InvalidLevelUpError("this level-up does not grant new cantrips");
  }
  throw new InvalidLevelUpError(`expected ${expected} new cantrips for this level-up, got ${provided}`);
}

/**
 * Validate a level-up submission against its derived plan and return the effective
 * ordered steps. Throws InvalidLevelUpError on any subclass-contract violation,
 * count mismatch, or excess field. `chosenSubclassName` is the resolved catalog
 * name for `submission.subclassId` (null when not submitted); the caller resolves
 * the id — this module never touches the DB.
 */
export function validateLevelUpSubmission(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
  submission: LevelUpSubmission,
): LevelUpStep[] {
  const plan = resolveEffectivePlan(character, target, chosenSubclassName, submission);
  assertCounts(plan, chosenSubclassName, submission);
  assertNoExcess(plan, submission);
  assertForgets(plan, character, submission);
  assertCantrips(plan, submission);
  return plan;
}
