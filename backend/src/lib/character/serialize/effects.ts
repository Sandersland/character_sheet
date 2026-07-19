import {
  buffsByTarget,
  normalizeActiveEffectsMutable,
  type ActiveBuff,
  type ActiveEffectsMutableState,
} from "@/lib/combat/active-effects.js";
import type { ConditionsMutableState } from "@/lib/combat/conditions.js";
import { deriveItemPassiveBonuses, type ItemPassiveContribution } from "@/lib/inventory/capabilities.js";
import { CONDITIONS, type RollModifier } from "@/lib/srd/srd.js";
import { exhaustionRollEffects } from "@/lib/srd/condition-data.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

// The per-target modifier channel both skills and weapon math read: active cast
// buffs (buffsByTarget) merged with active-item scalar passiveBonus contributions
// (#545). Keyed the same way (skill name / meleeDamage / attackRoll) so item
// bonuses and buffs sum together.
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

// The per-target modifier channel for one character: active cast buffs merged
// with active-item scalar passiveBonus contributions (#545), keyed by target
// (skill name / meleeDamage / attackRoll / ac / speed / …).
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

// State-driven roll modifiers (#486): advantage/disadvantage grants from active
// conditions (5e rules data in srd) merged with active-effect buffs (e.g. Rage).
// Derived on read — the frontend resolves the effective mode per roll
// (adv + disadv from different sources cancel to normal, RAW).
export function buildRollModifiers(
  conditions: ConditionsMutableState,
  activeEffects: ActiveEffectsMutableState,
): RollModifier[] {
  const out: RollModifier[] = [];
  for (const entry of conditions.active) {
    const def = CONDITIONS.find((c) => c.key === entry.key);
    if (!def) continue;
    for (const effect of def.rollEffects ?? []) out.push({ ...effect, source: def.label });
  }
  for (const effect of exhaustionRollEffects(conditions.exhaustion)) {
    out.push({ ...effect, source: "Exhaustion" });
  }
  for (const buff of activeEffects.buffs) {
    for (const effect of buff.rollEffects ?? []) out.push({ ...effect, source: buff.source });
  }
  return out;
}
