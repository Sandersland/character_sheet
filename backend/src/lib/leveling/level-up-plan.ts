// Pure planner — every step is derived by diffing rule functions at N vs N-1; thresholds are never re-encoded here.
import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { subclassChoiceSwapCadence } from "@/lib/classes/types.js";
import { isEldritchKnightSlug, resolveSubclassSlug } from "@/lib/classes/subclass-slug.js";
import { effectiveMaxHitPoints, fixedAverageForDie, levelUpHpGain } from "@/lib/combat/hitpoints.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { abilityModifier, advancementSlotsForLevel, fightingStyleFeatSlots, hitDieFace } from "@/lib/srd/srd.js";
import {
  bardMagicalSecretsAt,
  casterModelFor,
  eldritchKnightSpellSchoolGate,
  levelUpCantripPicks,
  levelUpSpellPicks,
  maxSpellLevelForClass,
  spellListsFor,
  swapCadenceFor,
  type SpellSchoolGate,
  type SubclassCasterRef,
} from "@/lib/srd/spellcasting-tables.js";

export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyleFeat"
  | "toolProficiency"
  | "expertise"
  | "subclassChoice"
  | "newSpells"
  | "review";

export interface LevelUpStep {
  kind: LevelUpStepKind;
  count?: number;
  meta?: Record<string, unknown>;
}

export interface LevelUpPlanCharacter {
  abilityScores: Record<string, number>;
  classEntries: { name: string; subclass?: string | null; level: number }[];
  // #1101: for validating a swap forget. Only id/level/source matter (a legal swap target is a user-learned leveled spell); populated in resolveLevelUpContext, absent in swap-free callers.
  spellEntries?: { id: string; level: number; source?: string | null }[];
  // #1291: edition-aware subclass gate — resolved once by the caller (resolveLevelUpContext) since this pure planner has no row to read editionOf from.
  edition: RulesEdition;
  // #1497: effectiveMaxHitPoints composition inputs, resolved once by resolveLevelUpContext (effectiveMaxHitPointsForRow) so hitPointsStep previews the post-level EFFECTIVE max through the same function bumpHpForLevelUp commits with. `rawMax` is the pre-halving stored max, not the served character.hitPoints.max.
  hpBaseline?: { rawMax: number; maxHpBonus: number; exhaustionLevel: number };
}

// subclassLevel arrives already edition-resolved via subclassGateLevel (#1308) — never the raw 2014-only catalog column. Defaults to 3, matching subclassGateLevel's own default.
export interface TargetClassEntry {
  name: string;
  subclass?: string | null;
  // resolveSubclassSlug prefers this FK identity over the drift-prone `subclass` display name; resolveLevelUpContext resolves it from the persisted entry's subclassRef. `null` when no subclass is chosen yet or a brand-new entry (#1148).
  subclassRef?: { slug: string } | null;
  // #1531: persisted/re-plan-picked subclass's casterFraction/spellcastingAbility. Every third-caster check below reads THIS field, never `subclass`/`subclassRef.slug`.
  subclassCasterRef?: SubclassCasterRef | null;
  newLevel: number;
  subclassLevel?: number;
  // #1380: required (not optional) so a future call site can't silently fall back to the persisted position-0 die — the multiclass wrong-die bug.
  hitDie: string;
  // #1529: resolved by the caller (resolveLevelUpContext) — a pure planner has no DB relation to read these. Defaults ([]/null) match a homebrew class's catalog-less fallback.
  extraAsiLevels?: number[];
  fightingStyleFeatLevel?: number | null;
  // #1546: seeded ClassFeature rows for THIS target, resolved by the caller — a pure planner has no DB relation to read these. subclassFeatureRows is the PERSISTED subclass's own rows; a not-yet-committed `?subclassId=` pick's rows travel separately as resolveLevelUpPlan's own parameter.
  classFeatureRows?: ClassFeatureRow[];
  subclassFeatureRows?: ClassFeatureRow[];
  // #1631: the EFFECTIVE subclass's SubclassSpellListExpansion spellIds, already edition-admitted by the caller (loadSubclassSpellListExpansionIds) — uses the not-yet-committed pick when this level-up sets a new subclass, else the persisted one. Widens newSpellsStep's choosable pool; never a free grant.
  subclassSpellListExpansionIds?: string[];
}

interface PlanContext {
  target: TargetClassEntry;
  // hitPointsStep's Con modifier source; every other step reads the scores only through the already-derived `now`/`prev`.
  abilityScores: Record<string, number>;
  now: DerivedClassInfo | null;
  prev: DerivedClassInfo | null;
  // Threaded to newSpellsStep's spellListsFor call — Magical Secrets resolves differently per edition (#1440).
  edition: RulesEdition;
  // hitPointsStep's effective-max preview inputs (#1497).
  hpBaseline?: { rawMax: number; maxHpBonus: number; exhaustionLevel: number };
}

function derivedAt(
  target: TargetClassEntry,
  abilityScores: Record<string, number>,
  level: number,
  edition: RulesEdition,
): DerivedClassInfo | null {
  if (level < 1) return null;
  // #1546: an EMPTY featureRows carrier can make deriveResources' null-guard return null where a populated carrier would return an object — every step below stays null-safe via `now?.[field] ?? 0` / `prev?.[field] ?? 0` regardless.
  // #1576: passing target.subclassLevel (already subclassGateLevel-resolved) is safe — the function is idempotent on an already-resolved input.
  const featureRows: ClassFeatureRowsCarrier = {
    classRows: target.classFeatureRows ?? [],
    subclassRows: target.subclassFeatureRows ?? [],
    subclassLevel: target.subclassLevel,
  };
  return deriveResources(target.name, target.subclass ?? undefined, level, abilityScores, proficiencyBonusForLevel(level), featureRows, edition);
}

// Every number routes through levelUpHpGain — the same function applyLevelUpOp commits with — so preview and commit agree by construction.
// `fixedAverage` is served rather than left to the client as averageGain − conMod: the max(1, …) level-up floor makes that subtraction wrong.
// No `edition` param on the gain numbers (PHB'14 p. 15 / PHB'24 p. 36 read identically); `edition` IS threaded into effectiveMaxHitPoints below since exhaustion's PHB'14 p. 291 tier-4 halving is 2014-only.
// #1497: effectiveMaxAverage/effectiveMaxByRoll route through effectiveMaxHitPoints — the same function bumpHpForLevelUp commits with — over `hpBaseline.rawMax + gain`, not `currentMax + gain` (wrong once the pre-halving max's parity flips at exhaustion 4+).
// effectiveMaxByRoll is indexed 1..faces (index 0 unused) for direct `array[roll]` reads.
function hitPointsStep({ target, abilityScores, hpBaseline, edition }: PlanContext): LevelUpStep {
  const faces = hitDieFace(target.hitDie);
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const baseline = hpBaseline ?? { rawMax: 0, maxHpBonus: 0, exhaustionLevel: 0 };
  const effectiveMaxForGain = (gain: number) =>
    effectiveMaxHitPoints(baseline.rawMax + gain, baseline.maxHpBonus, baseline.exhaustionLevel, edition);
  const averageGain = levelUpHpGain(faces, conMod, "average");
  return {
    kind: "hitPoints",
    meta: {
      die: target.hitDie,
      faces,
      conMod,
      fixedAverage: fixedAverageForDie(faces),
      averageGain,
      minRoll: levelUpHpGain(faces, conMod, "roll", 1),
      maxRoll: levelUpHpGain(faces, conMod, "roll", faces),
      effectiveMaxAverage: effectiveMaxForGain(averageGain),
      effectiveMaxByRoll: [
        0,
        ...Array.from({ length: faces }, (_, i) => effectiveMaxForGain(levelUpHpGain(faces, conMod, "roll", i + 1))),
      ],
    },
  };
}

function advancementStep({ target }: PlanContext): LevelUpStep | null {
  const extraAsiLevels = target.extraAsiLevels ?? [];
  const delta = advancementSlotsForLevel(extraAsiLevels, target.newLevel) - advancementSlotsForLevel(extraAsiLevels, target.newLevel - 1);
  return delta > 0 ? { kind: "advancement", count: delta } : null;
}

function subclassStep({ target }: PlanContext): LevelUpStep | null {
  const subclassLevel = target.subclassLevel ?? 3;
  return target.newLevel === subclassLevel && !target.subclass ? { kind: "subclass" } : null;
}

// #1137: Fighter's arrives at level 1, Paladin's/Ranger's at level 2, and a Champion's second slot at 7 (2024) / 10 (2014, #1148) — derived from the fightingStyleFeatSlots delta. `target.subclass` resolves via resolveSubclassSlug, never a raw string comparison (#1277).
function fightingStyleFeatStep({ target, edition }: PlanContext): LevelUpStep | null {
  const fightingStyleFeatLevel = target.fightingStyleFeatLevel ?? null;
  const subclass = resolveSubclassSlug(target.name, target);
  const delta =
    fightingStyleFeatSlots(fightingStyleFeatLevel, target.newLevel, subclass, edition) -
    fightingStyleFeatSlots(fightingStyleFeatLevel, target.newLevel - 1, subclass, edition);
  return delta > 0 ? { kind: "fightingStyleFeat", count: delta } : null;
}

// #1516: maneuvers carries meta.canSwap unconditionally whenever the step exists (PHB'14 Battle Master p. 73; SRD 5.2 carries the equivalent grant) — every source of maneuverChoiceCount grants this swap. Tool proficiency choices carry no such text, so they never get canSwap.
function choiceCountStep(
  { now, prev }: PlanContext,
  kind: LevelUpStepKind,
  field: "maneuverChoiceCount" | "toolProfChoiceCount" | "expertiseChoiceCount",
): LevelUpStep | null {
  const delta = (now?.[field] ?? 0) - (prev?.[field] ?? 0);
  if (delta <= 0) return null;
  return { kind, count: delta, ...(kind === "maneuvers" ? { meta: { canSwap: true } } : {}) };
}

// #899: one step per catalog key that grew. `canSwap` (#1503) rides `meta` when the catalogSource's swap cadence is "onLevelUp" — legal only "whenever you learn a new X", the same delta>0 condition that already gates this step's existence.
function subclassChoiceSteps({ now, prev, edition }: PlanContext): LevelUpStep[] {
  const prevCounts = new Map((prev?.subclassChoices ?? []).map((c) => [c.key, c.count]));
  return (now?.subclassChoices ?? [])
    .map((choice) => ({ choice, delta: choice.count - (prevCounts.get(choice.key) ?? 0) }))
    .filter(({ delta }) => delta > 0)
    .map(({ choice, delta }) => ({
      kind: "subclassChoice" as const,
      count: delta,
      meta: {
        key: choice.key,
        label: choice.label,
        catalogSource: choice.catalogSource,
        ...(subclassChoiceSwapCadence(choice.catalogSource, edition) === "onLevelUp" ? { canSwap: true } : {}),
      },
    }));
}

// #1440/#1825: spellLists/cantripLists resolve through spellListsFor — the same resolver GET /api/spells uses — so the eligibility gate, the picker, and the catalog picker can never diverge on EK/AT's wizard redirect or Bard Magical Secrets. Served even when null so "explicitly unrestricted" stays distinguishable from "absent".
// #1509: `casterModel` is the served noun ("known" vs "prepared") so level-up-submission.ts's swap messages and the frontend never re-derive it from className/edition.
// #1101/#1131: onLevelUp-cadence casters get a swap-only step even with no new spells; every caster also picks cantrips on a cantrips-known growth level. No seeded expansion list grants a cantrip today, so this never applies to cantripLists.
function expandedSpellIdsMeta(target: TargetClassEntry): { expandedSpellIds: string[] } | Record<string, never> {
  return target.subclassSpellListExpansionIds?.length ? { expandedSpellIds: target.subclassSpellListExpansionIds } : {};
}

// #1855: Eldritch Knight leveled-spell school gate (PHB'14 p. 74) — resolved through resolveSubclassSlug (#1277), never a name literal. `null` for every non-EK target so newSpellsStep's meta spread omits spellSchools for them.
function ekSpellSchoolGate(target: TargetClassEntry, edition: RulesEdition): SpellSchoolGate | null {
  const slug = resolveSubclassSlug(target.name, { subclass: target.subclass, subclassRef: target.subclassRef });
  return isEldritchKnightSlug(slug) ? eldritchKnightSpellSchoolGate(target.newLevel, edition) : null;
}

function schoolGateMeta(schoolGate: SpellSchoolGate | null): Record<string, unknown> {
  return {
    // `schools` is `string[] | null` — branch on `!== null`, never truthiness (matches assertOnSpellList's convention in level-up-transaction.ts).
    ...(schoolGate !== null && schoolGate.schools !== null ? { spellSchools: schoolGate.schools } : {}),
    ...(schoolGate?.freePicks ? { freeSchoolPicks: schoolGate.freePicks } : {}),
  };
}

function newSpellsStep({ target, edition }: PlanContext): LevelUpStep | null {
  const count = levelUpSpellPicks(target.name, target.newLevel, target.subclassCasterRef, edition);
  const cantrips = levelUpCantripPicks(target.name, target.newLevel, target.subclassCasterRef);
  const canSwap = swapCadenceFor(target.name, target.subclassCasterRef, edition) === "onLevelUp" && target.newLevel >= 2;
  if (count <= 0 && cantrips <= 0 && !canSwap) return null;
  const magicalSecrets = bardMagicalSecretsAt(target.name, target.newLevel);
  const maxSpellLevel = maxSpellLevelForClass(target.name, target.newLevel, target.subclassCasterRef, edition);
  const lists = spellListsFor(target.name, target.newLevel, target.subclassCasterRef, edition);
  const casterModel = casterModelFor(target.name, target.subclassCasterRef, edition);
  const schoolGate = ekSpellSchoolGate(target, edition);
  return {
    kind: "newSpells",
    count,
    meta: {
      maxSpellLevel,
      spellLists: lists.spells,
      cantripLists: lists.cantrips,
      ...(magicalSecrets ? { magicalSecrets: true } : {}),
      ...(canSwap ? { canSwap: true } : {}),
      ...(cantrips > 0 ? { cantrips } : {}),
      ...(casterModel ? { casterModel } : {}),
      ...schoolGateMeta(schoolGate),
      ...expandedSpellIdsMeta(target),
    },
  };
}

// Computed for the CURRENTLY-KNOWN subclass: when `target.subclass` is null (reaching the subclass level) only the `subclass` step is emitted — the ceremony re-plans after that step.
export function buildLevelUpPlan(character: LevelUpPlanCharacter, target: TargetClassEntry): LevelUpStep[] {
  const ctx: PlanContext = {
    target,
    abilityScores: character.abilityScores,
    now: derivedAt(target, character.abilityScores, target.newLevel, character.edition),
    prev: derivedAt(target, character.abilityScores, target.newLevel - 1, character.edition),
    edition: character.edition,
    hpBaseline: character.hpBaseline,
  };

  const candidates: (LevelUpStep | null)[] = [
    hitPointsStep(ctx),
    advancementStep(ctx),
    subclassStep(ctx),
    choiceCountStep(ctx, "maneuvers", "maneuverChoiceCount"),
    fightingStyleFeatStep(ctx),
    choiceCountStep(ctx, "toolProficiency", "toolProfChoiceCount"),
    choiceCountStep(ctx, "expertise", "expertiseChoiceCount"),
    ...subclassChoiceSteps(ctx),
    newSpellsStep(ctx),
    { kind: "review" },
  ];

  return candidates.filter((step): step is LevelUpStep => step !== null);
}
