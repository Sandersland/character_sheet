// Pure planner: the ordered choice-steps advancing to per-class level N grants.
// Every step is DERIVED by diffing the existing rule functions at N vs N-1 —
// thresholds are never re-encoded here. Consumed by the level-up ceremony (#886)
// and validated against by the transaction endpoint (#885).
import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { advancementSlotsForLevel, fightingStyleFeatSlots } from "@/lib/srd/srd.js";
import {
  bardMagicalSecretsAt,
  levelUpCantripPicks,
  levelUpSpellPicks,
  maxSpellLevelForClass,
  swapCadenceFor,
} from "@/lib/srd/spellcasting-tables.js";

export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyleFeat"
  | "disciplines"
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
}

// The class entry AFTER this level-up. subclassLevel is passed in (a pure fn
// can't fetch the catalog Class row); defaults to 3, mirroring reconcileSubclass.
export interface TargetClassEntry {
  name: string;
  subclass?: string | null;
  newLevel: number;
  subclassLevel?: number;
}

// The target plus its derived resources at N and N-1 — the context each step reads.
interface PlanContext {
  target: TargetClassEntry;
  now: DerivedClassInfo | null;
  prev: DerivedClassInfo | null;
}

// deriveResources at a given per-class level, holding the target subclass fixed.
function derivedAt(target: TargetClassEntry, abilityScores: Record<string, number>, level: number): DerivedClassInfo | null {
  if (level < 1) return null;
  return deriveResources(target.name, target.subclass ?? undefined, level, abilityScores, proficiencyBonusForLevel(level));
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

// Diff one bespoke choose-N count (maneuvers/disciplines/tools) across N vs N-1.
function choiceCountStep(
  { now, prev }: PlanContext,
  kind: LevelUpStepKind,
  field: "maneuverChoiceCount" | "disciplineChoiceCount" | "toolProfChoiceCount",
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
// are Magical Secrets.
function newSpellsStep({ target }: PlanContext): LevelUpStep | null {
  const count = levelUpSpellPicks(target.name, target.newLevel, target.subclass);
  const cantrips = levelUpCantripPicks(target.name, target.newLevel, target.subclass);
  const canSwap = swapCadenceFor(target.name, target.subclass) === "onLevelUp" && target.newLevel >= 2;
  if (count <= 0 && cantrips <= 0 && !canSwap) return null;
  const magicalSecrets = bardMagicalSecretsAt(target.name, target.newLevel);
  const maxSpellLevel = maxSpellLevelForClass(target.name, target.newLevel, target.subclass);
  return {
    kind: "newSpells",
    count,
    meta: {
      maxSpellLevel,
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
    now: derivedAt(target, character.abilityScores, target.newLevel),
    prev: derivedAt(target, character.abilityScores, target.newLevel - 1),
  };

  const candidates: (LevelUpStep | null)[] = [
    { kind: "hitPoints" },
    advancementStep(ctx),
    subclassStep(ctx),
    choiceCountStep(ctx, "maneuvers", "maneuverChoiceCount"),
    fightingStyleFeatStep(ctx),
    choiceCountStep(ctx, "disciplines", "disciplineChoiceCount"),
    choiceCountStep(ctx, "toolProficiency", "toolProfChoiceCount"),
    ...subclassChoiceSteps(ctx),
    newSpellsStep(ctx),
    { kind: "review" },
  ];

  return candidates.filter((step): step is LevelUpStep => step !== null);
}
