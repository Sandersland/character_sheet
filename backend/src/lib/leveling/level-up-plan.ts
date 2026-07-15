// Pure planner: the ordered choice-steps advancing to per-class level N grants.
// Every step is DERIVED by diffing the existing rule functions at N vs N-1 —
// thresholds are never re-encoded here. Consumed by the level-up ceremony (#886)
// and validated against by the transaction endpoint (#885).
import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { advancementSlotsForLevel, fightingStyleChoiceCount } from "@/lib/srd/srd.js";
import { learnsNewSpellsOnLevelUp, spellsGainedAtLevel } from "@/lib/srd/spellcasting-tables.js";

export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyle"
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
}

// The class entry AFTER this level-up. subclassLevel is passed in (a pure fn
// can't fetch the catalog Class row); defaults to 3, mirroring reconcileSubclass.
export interface TargetClassEntry {
  name: string;
  subclass?: string | null;
  newLevel: number;
  subclassLevel?: number;
}

// deriveResources at a given per-class level, holding the target subclass fixed.
function derivedAt(
  target: TargetClassEntry,
  abilityScores: Record<string, number>,
  level: number,
): DerivedClassInfo | null {
  if (level < 1) return null;
  return deriveResources(target.name, target.subclass ?? undefined, level, abilityScores, proficiencyBonusForLevel(level));
}

/**
 * The ordered choice-steps advancing `target.name` to `target.newLevel` grants.
 * Pure — no DB access. Each step is derived by diffing a rule function at the
 * new level vs one below; steps with a zero delta are omitted.
 */
export function buildLevelUpPlan(character: LevelUpPlanCharacter, target: TargetClassEntry): LevelUpStep[] {
  const steps: LevelUpStep[] = [];
  const { abilityScores } = character;
  const n = target.newLevel;

  steps.push({ kind: "hitPoints" });

  const advDelta = advancementSlotsForLevel(target.name, n) - advancementSlotsForLevel(target.name, n - 1);
  if (advDelta > 0) steps.push({ kind: "advancement", count: advDelta });

  const subclassLevel = target.subclassLevel ?? 3;
  if (n === subclassLevel && !target.subclass) steps.push({ kind: "subclass" });

  const now = derivedAt(target, abilityScores, n);
  const prev = derivedAt(target, abilityScores, n - 1);

  const maneuverDelta = (now?.maneuverChoiceCount ?? 0) - (prev?.maneuverChoiceCount ?? 0);
  if (maneuverDelta > 0) steps.push({ kind: "maneuvers", count: maneuverDelta });

  const fsDelta = fightingStyleChoiceCount(target.name, n) - fightingStyleChoiceCount(target.name, n - 1);
  if (fsDelta > 0) steps.push({ kind: "fightingStyle", count: fsDelta });

  const disciplineDelta = (now?.disciplineChoiceCount ?? 0) - (prev?.disciplineChoiceCount ?? 0);
  if (disciplineDelta > 0) steps.push({ kind: "disciplines", count: disciplineDelta });

  const toolDelta = (now?.toolProfChoiceCount ?? 0) - (prev?.toolProfChoiceCount ?? 0);
  if (toolDelta > 0) steps.push({ kind: "toolProficiency", count: toolDelta });

  const prevChoiceCounts = new Map((prev?.subclassChoices ?? []).map((c) => [c.key, c.count]));
  for (const choice of now?.subclassChoices ?? []) {
    const delta = choice.count - (prevChoiceCounts.get(choice.key) ?? 0);
    if (delta > 0) {
      steps.push({
        kind: "subclassChoice",
        count: delta,
        meta: { key: choice.key, label: choice.label, catalogSource: choice.catalogSource },
      });
    }
  }

  if (learnsNewSpellsOnLevelUp(target.name, target.subclass)) {
    const newSpells = spellsGainedAtLevel(target.name, n);
    if (newSpells > 0) steps.push({ kind: "newSpells", count: newSpells });
  }

  steps.push({ kind: "review" });
  return steps;
}
