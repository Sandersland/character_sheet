import type { RulesEdition } from "@character-sheet/shared-types";

import {
  buffsByTarget,
  normalizeActiveEffectsMutable,
  type ActiveBuff,
  type ActiveEffectsMutableState,
} from "@/lib/combat/active-effects.js";
import type { ConditionsMutableState } from "@/lib/combat/conditions.js";
import { deriveItemPassiveBonuses, type ItemPassiveContribution } from "@/lib/inventory/capabilities.js";
import type { RollModifier } from "@/lib/srd/srd.js";
import { conditionDefinition, exhaustionRollEffects } from "@/lib/srd/condition-data.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

// Keyed by skill name / meleeDamage / attackRoll / etc. so item bonuses and buffs sum by target (#545).
export type TargetModifierMap = Record<string, Array<{ modifier: number; source: string; condition?: string }>>;

function mergeTargetModifiers(
  buffTargets: Record<string, ActiveBuff[]>,
  contributions: ItemPassiveContribution[],
): TargetModifierMap {
  const out: TargetModifierMap = {};
  for (const [key, buffs] of Object.entries(buffTargets)) {
    out[key] = buffs.map((b) => ({ modifier: b.modifier, source: b.source }));
  }
  for (const c of contributions) {
    (out[c.target] ??= []).push({
      modifier: c.modifier,
      source: c.source,
      ...(c.condition ? { condition: c.condition } : {}),
    });
  }
  return out;
}

export function buildTargetModifiers(
  row: CharacterWithRelations,
  activeEffects: ReturnType<typeof normalizeActiveEffectsMutable>,
): TargetModifierMap {
  const itemPassiveBonuses = deriveItemPassiveBonuses(
    row.inventoryItems.map((i) => ({
      name: i.name,
      equipped: i.equippedSlot != null,
      attuned: i.attuned,
      capabilities: i.capabilities,
    })),
  );
  return mergeTargetModifiers(buffsByTarget(activeEffects), itemPassiveBonuses);
}

// adv + disadv from different sources cancel to normal (RAW); the frontend resolves the effective mode per roll.
export function buildRollModifiers(
  conditions: ConditionsMutableState,
  activeEffects: ActiveEffectsMutableState,
  edition: RulesEdition,
): RollModifier[] {
  const out: RollModifier[] = [];
  for (const entry of conditions.active) {
    // Safe to assert: normalizeConditionsMutable already dropped any entry.key that fails isKnownCondition.
    const def = conditionDefinition(entry.key, edition);
    for (const effect of def.rollEffects ?? []) out.push({ ...effect, source: def.label });
  }
  for (const effect of exhaustionRollEffects(conditions.exhaustion, edition)) {
    out.push({ ...effect, source: "Exhaustion" });
  }
  for (const buff of activeEffects.buffs) {
    for (const effect of buff.rollEffects ?? []) out.push({ ...effect, source: buff.source });
  }
  return out;
}
