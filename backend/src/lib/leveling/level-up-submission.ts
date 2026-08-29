// Pure validator (#885): no DB, no Prisma — the caller resolves any subclass id → name before calling.
import type { LevelUpTarget } from "@character-sheet/contracts";

import type { AdvancementOperation, TakeFeatOperation } from "@/lib/leveling/advancement.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import type {
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  LearnExpertiseOperation,
  LearnManeuverOperation,
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
import type { SubclassCasterRef } from "@/lib/srd/spellcasting-tables.js";

// Untyped status → the transactions-endpoint scaffold defaults domain errors to 400 (the #1007 typed-error system), so no `status` field here.
export class InvalidLevelUpError extends Error {}

// Op payloads reuse the exact op types their domains export (only takeAsi/takeFeat for `advancement`); zod validation lives in the route, not here.
export interface LevelUpSubmission {
  target: LevelUpTarget;
  hp: { method: "average" | "roll"; roll?: number };
  advancement?: AdvancementOperation;
  subclassId?: string;
  // #1137: a Fighting Style feat pick — a takeFeat op; the transaction forces slot:"fightingStyle" server-side so it lands in the fs partition.
  fightingStyleFeat?: TakeFeatOperation;
  maneuvers?: LearnManeuverOperation[];
  // #1516: a maneuver swap — one forgotten entry offset by one extra learn under the SAME step (assertManeuverForgets below).
  maneuversForgotten?: ForgetManeuverOperation[];
  toolProficiencies?: LearnToolProficiencyOperation[];
  // #1588: Expertise skill picks are freely reversible, so there is no expertiseForgotten field.
  expertise?: LearnExpertiseOperation[];
  subclassChoices?: LearnSubclassChoiceOperation[];
  // #1503: a swap for a choose-N choice whose swapCadence is "onLevelUp" (today: Four Elements' disciplines) — one forgotten entry offset by one extra learn under the SAME choiceKey (assertSubclassChoiceForgets below).
  subclassChoicesForgotten?: ForgetSubclassChoiceOperation[];
  spellsLearned?: LearnSpellOperation[];
  // #1131: new cantrips picked this level — counted against the newSpells step's meta.cantrips, separately from leveled picks (a cantrip never offsets a swap).
  cantripsLearned?: LearnSpellOperation[];
  // #1101/#1127: an optional prepared-spell swap — one forgotten entry offset by one extra learn (net count still equals the newSpells step's count).
  spellsForgotten?: ForgetSpellOperation[];
}

// Mirrors the candidates array order in buildLevelUpPlan; the subclass step is spliced back at this rank after a re-plan (which omits it).
const KIND_ORDER: LevelUpStepKind[] = [
  "hitPoints", "advancement", "subclass", "maneuvers", "fightingStyleFeat",
  "toolProficiency", "expertise", "subclassChoice", "newSpells", "review",
];

// One count-checkable submission domain that maps 1:1 to a plan step kind. `subclass` and `subclassChoice` are handled specially (below) and excluded.
interface SimpleDomain {
  kind: Exclude<LevelUpStepKind, "subclass" | "subclassChoice" | "review">;
  provided: (s: LevelUpSubmission) => number;
  noun: string;
  absentMessage: string;
}

const SIMPLE_DOMAINS: SimpleDomain[] = [
  { kind: "hitPoints", provided: () => 1, noun: "hit point roll", absentMessage: "this level-up does not include hit points" },
  { kind: "advancement", provided: (s) => (s.advancement ? 1 : 0), noun: "advancement", absentMessage: "this level-up does not include an ability score improvement or feat" },
  { kind: "fightingStyleFeat", provided: (s) => (s.fightingStyleFeat ? 1 : 0), noun: "fighting style", absentMessage: "this level-up does not include a fighting style choice" },
  { kind: "maneuvers", provided: (s) => s.maneuvers?.length ?? 0, noun: "maneuvers", absentMessage: "this level-up does not grant maneuvers" },
  { kind: "toolProficiency", provided: (s) => s.toolProficiencies?.length ?? 0, noun: "tool proficiencies", absentMessage: "this level-up does not grant a tool proficiency" },
  { kind: "expertise", provided: (s) => s.expertise?.length ?? 0, noun: "Expertise picks", absentMessage: "this level-up does not grant Expertise" },
  { kind: "newSpells", provided: (s) => s.spellsLearned?.length ?? 0, noun: "new spells", absentMessage: "this level-up does not grant new spells" },
];

function insertSubclassStep(plan: LevelUpStep[]): LevelUpStep[] {
  const subclassRank = KIND_ORDER.indexOf("subclass");
  const at = plan.findIndex((step) => KIND_ORDER.indexOf(step.kind) > subclassRank);
  const idx = at === -1 ? plan.length : at;
  return [...plan.slice(0, idx), { kind: "subclass" }, ...plan.slice(idx)];
}

// When the base plan surfaces a subclass step AND a subclass is chosen, the plan is rebuilt for that subclass and the subclass step re-inserted. With no chosen subclass the base plan is returned as-is.
export function resolveLevelUpPlan(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
  // #1546: the not-yet-committed `?subclassId=` pick's own feature rows. Absent when chosenSubclassName is null.
  pickedSubclassFeatureRows?: ClassFeatureRow[] | null,
  // #1531: the PICKED subclass's own casterFraction/spellcastingAbility — required so a FIRST-time EK/AT pick resolves its own newSpells step correctly on re-plan.
  chosenSubclassCasterRef?: SubclassCasterRef | null,
): LevelUpStep[] {
  const basePlan = buildLevelUpPlan(character, target);
  if (!chosenSubclassName || !basePlan.some((step) => step.kind === "subclass")) {
    return basePlan;
  }
  const replan = buildLevelUpPlan(character, {
    ...target,
    subclass: chosenSubclassName,
    subclassCasterRef: chosenSubclassCasterRef ?? null,
    subclassFeatureRows: pickedSubclassFeatureRows ?? [],
  });
  return insertSubclassStep(replan);
}

function resolveEffectivePlan(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
  submission: LevelUpSubmission,
  pickedSubclassFeatureRows?: ClassFeatureRow[] | null,
  chosenSubclassCasterRef?: SubclassCasterRef | null,
): LevelUpStep[] {
  const plan = resolveLevelUpPlan(character, target, chosenSubclassName, pickedSubclassFeatureRows, chosenSubclassCasterRef);
  const needsSubclass = plan.some((step) => step.kind === "subclass");
  if (needsSubclass && !chosenSubclassName) {
    throw new InvalidLevelUpError("this level-up requires choosing a subclass");
  }
  if (!needsSubclass && submission.subclassId) {
    throw new InvalidLevelUpError("this level-up does not include a subclass choice");
  }
  return plan;
}

// subclassChoice is checked per `meta.key`.
function assertCounts(plan: LevelUpStep[], chosenSubclassName: string | null, submission: LevelUpSubmission): void {
  for (const step of plan) {
    if (step.kind === "review") continue;
    const expected = step.count ?? 1;
    const { provided, noun } = stepProvided(step, chosenSubclassName, submission);
    if (provided !== expected) {
      // A negative net only happens when a swap forget outnumbers the learns.
      if (provided < 0) {
        const unit = swapUnitNoun(step);
        throw new InvalidLevelUpError(`You must learn a replacement ${unit} for every ${unit} you swap out.`);
      }
      throw new InvalidLevelUpError(`expected ${expected} ${noun} for this level-up, got ${provided}`);
    }
  }
}

// Names the swappable UNIT (singular) for the negative-net message — distinct from stepProvided's noun (plural/label-shaped). Only step kinds with a swap mechanism can go negative: newSpells, subclassChoice, maneuvers.
function swapUnitNoun(step: LevelUpStep): string {
  if (step.kind === "maneuvers") return "maneuver";
  if (step.kind === "subclassChoice") return `${String(step.meta?.key)} choice`;
  return "spell";
}

// #1101: learns net of the one optional swap forget.
function netSpellsLearned(submission: LevelUpSubmission): number {
  return (submission.spellsLearned?.length ?? 0) - (submission.spellsForgotten?.length ?? 0);
}

// #1503: same shape as netSpellsLearned, scoped to one choiceKey — a swap offsets, so the NET learn count for that key must equal the step's own count.
function netSubclassChoiceLearned(key: unknown, submission: LevelUpSubmission): number {
  const learned = (submission.subclassChoices ?? []).filter((c) => c.choiceKey === key).length;
  const forgotten = (submission.subclassChoicesForgotten ?? []).filter((c) => c.choiceKey === key).length;
  return learned - forgotten;
}

// #1516: same shape as netSpellsLearned/netSubclassChoiceLearned — a maneuver swap offsets, so the NET learn count must equal the "maneuvers" step's own count.
function netManeuversLearned(submission: LevelUpSubmission): number {
  return (submission.maneuvers?.length ?? 0) - (submission.maneuversForgotten?.length ?? 0);
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
    return { provided: netSubclassChoiceLearned(key, submission), noun: `${String(key)} choices` };
  }
  // #1101: a swap offsets its extra learn — the NET learn count must equal the step count (spellsLearned.length === step.count + spellsForgotten.length).
  if (step.kind === "newSpells") {
    return { provided: netSpellsLearned(submission), noun: "new spells" };
  }
  if (step.kind === "maneuvers") {
    return { provided: netManeuversLearned(submission), noun: "maneuvers" };
  }
  const domain = SIMPLE_DOMAINS.find((d) => d.kind === step.kind)!;
  return { provided: domain.provided(submission), noun: domain.noun };
}

// Any populated submission field with no matching plan step is excess and rejected (the count check only visits fields the plan expects).
// spellsForgotten is absent from SIMPLE_DOMAINS by design — assertForgets rejects stray forgets with the swap-specific message.
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

// #1101/#1127: a legal swap target is a user-learned (source null) leveled spell — not a cantrip (level 0) or a granted/item spell (source set).
function isSwappableEntry(entry: NonNullable<LevelUpPlanCharacter["spellEntries"]>[number] | undefined): boolean {
  return entry != null && entry.level > 0 && entry.source == null;
}

// #1509: the noun assertForgets messages use — "known spell" for a 2014 Bard/Sorcerer/Warlock/Ranger (+ EK/AT), "prepared spell" otherwise. Never re-derived from className/edition — this module has neither in scope (#1440).
function swapNoun(step: LevelUpStep | undefined): string {
  return step?.meta?.casterModel === "known" ? "known spell" : "prepared spell";
}

// #1127: a swap forgets exactly one user-learned leveled spell, only on a newSpells step with meta.canSwap. `plan.find()` runs BEFORE the `length > 1` guard so swapNoun can name the noun in every message, including "at most one" (#1509).
function assertForgets(plan: LevelUpStep[], character: LevelUpPlanCharacter, submission: LevelUpSubmission): void {
  const forgets = submission.spellsForgotten ?? [];
  if (forgets.length === 0) return;
  const step = plan.find((s) => s.kind === "newSpells");
  const noun = swapNoun(step);
  if (forgets.length > 1) {
    throw new InvalidLevelUpError(`You may swap at most one ${noun} per level-up.`);
  }
  if (step?.meta?.canSwap !== true) {
    throw new InvalidLevelUpError(`this level-up does not allow swapping a ${noun}`);
  }
  const entries = character.spellEntries ?? [];
  for (const op of forgets) {
    if (!isSwappableEntry(entries.find((e) => e.id === op.entryId))) {
      throw new InvalidLevelUpError(`Cannot swap that spell: ${op.entryId} is not a swappable ${noun}.`);
    }
  }
}

// #1503: a choose-N swap forgets at most one entry PER choiceKey, only on a subclassChoice step with meta.canSwap true. Entry-existence isn't re-checked here — applyForgetSubclassChoiceOp (resources.ts) already rejects an unknown entryId at apply time.
function assertSubclassChoiceForgets(plan: LevelUpStep[], submission: LevelUpSubmission): void {
  const forgets = submission.subclassChoicesForgotten ?? [];
  if (forgets.length === 0) return;
  const byKey = new Map<string, number>();
  for (const op of forgets) {
    byKey.set(op.choiceKey, (byKey.get(op.choiceKey) ?? 0) + 1);
  }
  for (const [key, count] of byKey) {
    if (count > 1) {
      throw new InvalidLevelUpError(`You may swap at most one ${key} choice per level-up.`);
    }
    const step = plan.find((s) => s.kind === "subclassChoice" && s.meta?.key === key);
    if (step?.meta?.canSwap !== true) {
      throw new InvalidLevelUpError(`this level-up does not allow swapping a "${key}" choice`);
    }
  }
}

// #1516: a maneuver swap forgets at most one entry, only on a "maneuvers" step with meta.canSwap true. Entry-existence isn't re-checked here — applyForgetManeuverOp (resources.ts) already rejects an unknown entryId.
// canSwap is checked BEFORE the length>1 guard (unlike assertForgets): on a level with no "maneuvers" step, 2 forgets must still say "does not allow swapping", not "at most one".
function assertManeuverForgets(plan: LevelUpStep[], submission: LevelUpSubmission): void {
  const forgets = submission.maneuversForgotten ?? [];
  if (forgets.length === 0) return;
  const step = plan.find((s) => s.kind === "maneuvers");
  if (step?.meta?.canSwap !== true) {
    throw new InvalidLevelUpError("this level-up does not allow swapping a maneuver");
  }
  if (forgets.length > 1) {
    throw new InvalidLevelUpError("You may swap at most one maneuver per level-up.");
  }
}

// #1131: new cantrips ride the newSpells step's meta.cantrips, counted separately from leveled picks (a cantrip never offsets a swap forget). A level with no newSpells step — or one granting no cantrips — rejects any cantripsLearned.
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

export function validateLevelUpSubmission(
  character: LevelUpPlanCharacter,
  target: TargetClassEntry,
  chosenSubclassName: string | null,
  submission: LevelUpSubmission,
  pickedSubclassFeatureRows?: ClassFeatureRow[] | null,
  chosenSubclassCasterRef?: SubclassCasterRef | null,
): LevelUpStep[] {
  const plan = resolveEffectivePlan(character, target, chosenSubclassName, submission, pickedSubclassFeatureRows, chosenSubclassCasterRef);
  assertCounts(plan, chosenSubclassName, submission);
  assertNoExcess(plan, submission);
  assertForgets(plan, character, submission);
  assertSubclassChoiceForgets(plan, submission);
  assertManeuverForgets(plan, submission);
  assertCantrips(plan, submission);
  return plan;
}
