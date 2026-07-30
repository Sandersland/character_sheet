// Pure planner: the ordered choice-steps advancing to per-class level N grants.
// Every step is DERIVED by diffing the existing rule functions at N vs N-1 —
// thresholds are never re-encoded here. Consumed by the level-up ceremony (#886)
// and validated against by the transaction endpoint (#885).
import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { fixedAverageForDie, levelUpHpGain } from "@/lib/combat/hitpoints.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { abilityModifier, advancementSlotsForLevel, fightingStyleFeatSlots, hitDieFace } from "@/lib/srd/srd.js";
import {
  bardMagicalSecretsAt,
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
  // A pure planner (LevelUpPlanCharacter has no DB relation, see its own
  // comment) — no featureRows carrier to pass, so this preview never lists
  // features (#1524's Fact 2: no consumer of this planner reads them).
  return deriveResources(target.name, target.subclass ?? undefined, level, abilityScores, proficiencyBonusForLevel(level), undefined, edition);
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
  const delta = advancementSlotsForLevel(target.name, target.newLevel) - advancementSlotsForLevel(target.name, target.newLevel - 1);
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
  const delta = fightingStyleFeatSlots(target.name, target.newLevel) - fightingStyleFeatSlots(target.name, target.newLevel - 1);
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

// Generic subclass "choose N from a catalog" (#899): one step per key that grew.
function subclassChoiceSteps({ now, prev }: PlanContext): LevelUpStep[] {
  const prevCounts = new Map((prev?.subclassChoices ?? []).map((c) => [c.key, c.count]));
  return (now?.subclassChoices ?? [])
    .map((choice) => ({ choice, delta: choice.count - (prevCounts.get(choice.key) ?? 0) }))
    .filter(({ delta }) => delta > 0)
    .map(({ choice, delta }) => ({
      kind: "subclassChoice" as const,
      count: delta,
      meta: { key: choice.key, label: choice.label, catalogSource: choice.catalogSource },
    }));
}

// 2024: onLevelUp-cadence casters (Bard/Sorcerer/Warlock + EK/AT) offer the
// prepared-count delta plus one optional swap (#1101), so a swap-only step
// (count 0, canSwap) is emitted even on a no-new-spells level; the Wizard scribes
// a flat 2 with no swap. #1131: every caster also picks new cantrips on a
// cantrips-known growth level (so Cleric/Druid get a cantrips-only step at 4/10),
// and a fresh level-1 entry offers its full initial spell+cantrip picks with no
// swap (a new entry may not swap other classes' spells). Bard picks from level 10
// are Magical Secrets. `spellLists`/`cantripLists` (#1440) are the served
// membership facts: the eligibility gate (assertPickSpellEligibility) and the
// picker (eligibleNewSpells/eligibleNewCantrips) both read these rather than
// re-deriving magicalSecretsSpellLists themselves — one rule, one call site,
// emitted unconditionally (including when null) so "explicitly unrestricted"
// stays distinguishable from "absent".
function newSpellsStep({ target, edition }: PlanContext): LevelUpStep | null {
  const count = levelUpSpellPicks(target.name, target.newLevel, target.subclass);
  const cantrips = levelUpCantripPicks(target.name, target.newLevel, target.subclass);
  const canSwap = swapCadenceFor(target.name, target.subclass) === "onLevelUp" && target.newLevel >= 2;
  if (count <= 0 && cantrips <= 0 && !canSwap) return null;
  const magicalSecrets = bardMagicalSecretsAt(target.name, target.newLevel);
  const maxSpellLevel = maxSpellLevelForClass(target.name, target.newLevel, target.subclass);
  const lists = magicalSecretsSpellLists(target.name, target.newLevel, target.subclass, edition);
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
