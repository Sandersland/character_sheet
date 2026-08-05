// Pure planner: the ordered choice-steps advancing to per-class level N grants.
// Every step is DERIVED by diffing the existing rule functions at N vs N-1 —
// thresholds are never re-encoded here. Consumed by the level-up ceremony (#886)
// and validated against by the transaction endpoint (#885).
import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { subclassChoiceSwapCadence } from "@/lib/classes/types.js";
import { fixedAverageForDie, levelUpHpGain } from "@/lib/combat/hitpoints.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { abilityModifier, advancementSlotsForLevel, fightingStyleFeatSlots, hitDieFace } from "@/lib/srd/srd.js";
import {
  bardMagicalSecretsAt,
  casterModelFor,
  levelUpCantripPicks,
  levelUpSpellPicks,
  magicalSecretsSpellLists,
  maxSpellLevelForClass,
  swapCadenceFor,
} from "@/lib/srd/spellcasting-tables.js";

export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyleFeat"
  | "toolProficiency"
  | "subclassChoice"
  | "newSpells"
  | "review";

export interface LevelUpStep {
  kind: LevelUpStepKind;
  count?: number;
  meta?: Record<string, unknown>;
}

// Pre-level-up character state (narrow, purpose-built — not the full wire shape).
export interface LevelUpPlanCharacter {
  abilityScores: Record<string, number>;
  classEntries: { name: string; subclass?: string | null; level: number }[];
  // The character's known spell entries, for validating a #1101 swap forget.
  // Only id/level/source matter (a legal swap target is a user-learned leveled
  // spell); populated in resolveLevelUpContext, absent in swap-free callers.
  spellEntries?: { id: string; level: number; source?: string | null }[];
  // deriveResources' subclass gate is edition-aware (#1291) — this pure planner
  // has no row to read editionOf from, so the caller (resolveLevelUpContext)
  // resolves it once and carries it alongside abilityScores/classEntries.
  edition: RulesEdition;
}

// The class entry AFTER this level-up. subclassLevel is passed in ALREADY
// edition-resolved (a pure fn can't fetch the catalog Class row or the
// character's edition) — the caller must route the raw catalog column through
// subclassGateLevel(..., edition) first (#1308); this field is never the raw
// 2014-only column. Defaults to 3 when absent, matching subclassGateLevel's own
// default.
export interface TargetClassEntry {
  name: string;
  subclass?: string | null;
  newLevel: number;
  subclassLevel?: number;
  // The hit die THIS level-up rolls, already resolved through advancingHitDie by
  // the caller. Required rather than optional (#1380): an optional field would
  // let a future construction site silently fall back to the character's
  // persisted position-0 die, which is the multiclass wrong-die bug.
  hitDie: string;
  // #1529: CharacterClass.extraAsiLevels/fightingStyleFeatLevel, already
  // resolved by the caller (resolveLevelUpContext, alongside subclassLevel) —
  // a pure planner has no DB relation to read them from itself. Defaults ([]
  // / null) match a homebrew class's catalog-less fallback, same shape as
  // subclassLevel's own default-3 comment.
  extraAsiLevels?: number[];
  fightingStyleFeatLevel?: number | null;
  // #1546 Part B-i: the seeded ClassFeature rows for THIS target — the FK
  // carrier resolveLevelUpContext resolves (TARGET_ENTRY_SELECT, mirroring
  // characterInclude's class.features/subclassRef.features), same rationale
  // as subclassLevel/extraAsiLevels above (a pure planner has no DB relation
  // to read these itself). `subclassFeatureRows` is the PERSISTED subclass's
  // own rows — absent when no subclass is chosen yet. The not-yet-committed
  // `?subclassId=` pick's own rows travel separately, as resolveLevelUpPlan's
  // own parameter (mirroring persistedGrantSource/pickedGrantSource,
  // level-up.ts, which solves this exact persisted/picked split for #898's
  // granted spells) — never baked onto this field, since a re-plan target
  // hasn't actually committed to that subclass.
  classFeatureRows?: ClassFeatureRow[];
  subclassFeatureRows?: ClassFeatureRow[];
}

// The target plus its derived resources at N and N-1 — the context each step reads.
interface PlanContext {
  target: TargetClassEntry;
  // hitPointsStep's Con modifier source; every other step reads the scores only
  // through the already-derived `now`/`prev`.
  abilityScores: Record<string, number>;
  now: DerivedClassInfo | null;
  prev: DerivedClassInfo | null;
  // Threaded to newSpellsStep's magicalSecretsSpellLists call — Magical Secrets
  // resolves differently per edition (#1440).
  edition: RulesEdition;
}

// deriveResources at a given per-class level, holding the target subclass fixed.
function derivedAt(
  target: TargetClassEntry,
  abilityScores: Record<string, number>,
  level: number,
  edition: RulesEdition,
): DerivedClassInfo | null {
  if (level < 1) return null;
  // #1546 Part B-i threaded this carrier (target.classFeatureRows/
  // subclassFeatureRows, resolved by the caller — see TargetClassEntry's own
  // comment), replacing the `undefined` this call passed before. #1546 Part
  // B-ii is what makes it load-bearing: Battle Master's maneuverChoiceCount/
  // toolProfChoiceCount/maneuverSaveDC moved OFF SubclassDefinition.deriveExtras
  // (code) onto these rows (registry.ts's deriveRowExtras), so choiceCountStep
  // below now genuinely diffs row-driven counts, not a coincidental `?? 0` over
  // two absent code-authored values. That also opens a null-flip channel this
  // function's callers must tolerate: with an EMPTY carrier (a bare test
  // fixture, or a class/subclass whose only content is now row-driven),
  // deriveResources' `resources.length === 0 && features.length === 0 &&
  // !hasExtras` guard can return null here where a real carrier would have
  // returned a populated object — see derive-resources-null-flip.test.ts and
  // level-up-plan-feature-rows.test.ts's explicit boundary assertion. Every
  // step below stays null-safe through `now?.[field] ?? 0` /
  // `prev?.[field] ?? 0` regardless (choiceCountStep), so a flip to null here
  // only ever reads as "nothing granted yet", never throws.
  // subclassLevel (#1576) feeds isSubclassActive so the gate survives its
  // class module's deletion. Safe to pass the value `target` already carries
  // even though the caller resolved it through subclassGateLevel first:
  // re-applying that function is idempotent — 2024 returns 3 for any input,
  // and 2014 returns `x ?? 3`, which is `x` for an already-resolved x.
  const featureRows: ClassFeatureRowsCarrier = {
    classRows: target.classFeatureRows ?? [],
    subclassRows: target.subclassFeatureRows ?? [],
    subclassLevel: target.subclassLevel,
  };
  return deriveResources(target.name, target.subclass ?? undefined, level, abilityScores, proficiencyBonusForLevel(level), featureRows, edition);
}

// Everything the ceremony's HP step shows the player: the advancing die, the Con
// modifier that applies to it, and the two outcomes they are choosing between
// (#1380). Every number routes through levelUpHpGain — the same function
// applyLevelUpOp commits with — so the preview and the commit agree by
// construction rather than by two matching copies of the arithmetic.
//
// `fixedAverage` is served rather than left to the client as averageGain −
// conMod: the max(1, …) level-up floor makes that subtraction wrong (a d6 with
// Con 1 gives averageGain 1, and 1 − (−5) reads 6, not 4).
//
// Missing constitution defaults to 10, matching buildHpOpContext — a plan that
// diverged there would preview NaN against a real committed number.
//
// No `edition` parameter: the fixed-average table (d6→4 … d12→7) and the floor
// read identically in SRD 5.1 and SRD 5.2 (PHB'14 p. 15 / PHB'24 p. 36).
function hitPointsStep({ target, abilityScores }: PlanContext): LevelUpStep {
  const faces = hitDieFace(target.hitDie);
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  return {
    kind: "hitPoints",
    meta: {
      die: target.hitDie,
      faces,
      conMod,
      fixedAverage: fixedAverageForDie(faces),
      averageGain: levelUpHpGain(faces, conMod, "average"),
      minRoll: levelUpHpGain(faces, conMod, "roll", 1),
      maxRoll: levelUpHpGain(faces, conMod, "roll", faces),
    },
  };
}

function advancementStep({ target }: PlanContext): LevelUpStep | null {
  const extraAsiLevels = target.extraAsiLevels ?? [];
  const delta = advancementSlotsForLevel(extraAsiLevels, target.newLevel) - advancementSlotsForLevel(extraAsiLevels, target.newLevel - 1);
  return delta > 0 ? { kind: "advancement", count: delta } : null;
}

// Emitted only when reaching the subclass level with no subclass yet chosen.
function subclassStep({ target }: PlanContext): LevelUpStep | null {
  const subclassLevel = target.subclassLevel ?? 3;
  return target.newLevel === subclassLevel && !target.subclass ? { kind: "subclass" } : null;
}

// A Fighting Style feat pick (#1137): Fighter's arrives with a new level-1 entry,
// Paladin's and Ranger's at level 2. Derived from the fightingStyleFeatSlots delta.
function fightingStyleFeatStep({ target }: PlanContext): LevelUpStep | null {
  const fightingStyleFeatLevel = target.fightingStyleFeatLevel ?? null;
  const delta = fightingStyleFeatSlots(fightingStyleFeatLevel, target.newLevel) - fightingStyleFeatSlots(fightingStyleFeatLevel, target.newLevel - 1);
  return delta > 0 ? { kind: "fightingStyleFeat", count: delta } : null;
}

// Diff one bespoke choose-N count (maneuvers/tools) across N vs N-1.
function choiceCountStep(
  { now, prev }: PlanContext,
  kind: LevelUpStepKind,
  field: "maneuverChoiceCount" | "toolProfChoiceCount",
): LevelUpStep | null {
  const delta = (now?.[field] ?? 0) - (prev?.[field] ?? 0);
  return delta > 0 ? { kind, count: delta } : null;
}

// Generic subclass "choose N from a catalog" (#899): one step per key that
// grew. `canSwap` (#1503) rides `meta` for a catalogSource whose swap cadence
// is "onLevelUp" — unlike newSpellsStep's swap (legal even on a no-new-picks
// level, so it needs its own swap-only step), a choose-N swap is PHB'14-legal
// only "whenever you learn a new X" — exactly the condition that already
// gates this step's existence (delta > 0) — so no separate swap-only step is
// needed; canSwap just rides the step that's already there.
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

// Per-edition: onLevelUp-cadence casters offer the prepared/known-count delta
// plus one optional swap (#1101), so a swap-only step (count 0, canSwap) is
// emitted even on a no-new-spells level — Bard/Sorcerer/Warlock + EK/AT in BOTH
// editions, plus the 2014 Ranger (SRD 5.1 swaps on level-up; SRD 5.2's Ranger
// re-prepares on a rest instead, #1509). The Wizard scribes a flat 2 with no
// swap. #1131: every caster also picks new cantrips on a cantrips-known growth
// level (so Cleric/Druid get a cantrips-only step at 4/10), and a fresh level-1
// entry offers its full initial spell+cantrip picks with no swap (a new entry
// may not swap other classes' spells). Bard picks from level 10 are Magical
// Secrets. `spellLists`/`cantripLists` (#1440) are the served membership facts:
// the eligibility gate (assertPickSpellEligibility) and the picker
// (eligibleNewSpells/eligibleNewCantrips) both read these rather than
// re-deriving magicalSecretsSpellLists themselves — one rule, one call site,
// emitted unconditionally (including when null) so "explicitly unrestricted"
// stays distinguishable from "absent". `casterModel` (#1509 D5) is the served
// noun the ceremony's swap copy renders — "known" for a 2014 Bard/Sorcerer/
// Warlock/Ranger (+ EK/AT in either edition), "prepared" for every SRD 5.2
// caster and every 2014 re-prepare class — so level-up-submission.ts's swap
// messages and the frontend never re-derive it from className/edition.
function newSpellsStep({ target, edition }: PlanContext): LevelUpStep | null {
  const count = levelUpSpellPicks(target.name, target.newLevel, target.subclass, edition);
  const cantrips = levelUpCantripPicks(target.name, target.newLevel, target.subclass);
  const canSwap = swapCadenceFor(target.name, target.subclass, edition) === "onLevelUp" && target.newLevel >= 2;
  if (count <= 0 && cantrips <= 0 && !canSwap) return null;
  const magicalSecrets = bardMagicalSecretsAt(target.name, target.newLevel);
  const maxSpellLevel = maxSpellLevelForClass(target.name, target.newLevel, target.subclass, edition);
  const lists = magicalSecretsSpellLists(target.name, target.newLevel, target.subclass, edition);
  const casterModel = casterModelFor(target.name, target.subclass, edition);
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
    },
  };
}

/**
 * The ordered choice-steps advancing `target.name` to `target.newLevel` grants.
 * Pure — no DB access. Each step is derived by diffing a rule function at the
 * new level vs one below; steps with a zero delta are omitted.
 *
 * The plan is computed for the CURRENTLY-KNOWN subclass: when `target.subclass`
 * is null (reaching the subclass level) only the `subclass` step is emitted —
 * subclass-derived choices can't be known until the subclass is picked, so the
 * ceremony re-plans after that step.
 */
export function buildLevelUpPlan(character: LevelUpPlanCharacter, target: TargetClassEntry): LevelUpStep[] {
  const ctx: PlanContext = {
    target,
    abilityScores: character.abilityScores,
    now: derivedAt(target, character.abilityScores, target.newLevel, character.edition),
    prev: derivedAt(target, character.abilityScores, target.newLevel - 1, character.edition),
    edition: character.edition,
  };

  const candidates: (LevelUpStep | null)[] = [
    hitPointsStep(ctx),
    advancementStep(ctx),
    subclassStep(ctx),
    choiceCountStep(ctx, "maneuvers", "maneuverChoiceCount"),
    fightingStyleFeatStep(ctx),
    choiceCountStep(ctx, "toolProficiency", "toolProfChoiceCount"),
    ...subclassChoiceSteps(ctx),
    newSpellsStep(ctx),
    { kind: "review" },
  ];

  return candidates.filter((step): step is LevelUpStep => step !== null);
}
