/**
 * spellCast.ts — pure computation helpers for spell casting rolls.
 *
 * Extracted from SpellsSection.handleCast so session-mode components
 * (TurnHub's InlineSpellPicker) can produce the same roll without
 * duplicating the cantrip-scaling / upcast-dice / heal-modifier math.
 *
 * No React, no JSX, no side effects — output is deterministic given the inputs.
 */

import { rollSpec } from "@/lib/dice";
import { abilityModifier } from "@/lib/abilities";
import { readEffectSpec, resolveEffectSpec } from "@/lib/effects";
import type {
  AbilityName,
  CastSpellOperation,
  Character,
  Spell,
  SpellcastingOperation,
} from "@/types/character";
import type { RollSpec, RollResult } from "@/lib/dice";

// The inline result banner shown immediately after a cast.
export interface CastResult {
  spellName: string;
  total: number;
  diceStr: string;
  effectKind: "damage" | "heal";
  damageType?: string | null;
  slotLevel?: number;
}

// The ops to send + the banner to show for a cast — no React/state.
export interface CastPlan {
  ops: SpellcastingOperation[];
  result: CastResult | null;
}

// A cast produces a display banner only for damage/heal spells; buff/utility
// spells have no effect dice (computeCastRoll returns null).
function bannerFor(
  spell: Spell,
  roll: { spec: RollSpec; total: number },
  slotLevel: number | undefined,
): CastResult | null {
  if (spell.effectKind !== "damage" && spell.effectKind !== "heal") return null;
  return {
    spellName: spell.name,
    total: roll.total,
    diceStr: `${roll.spec.count}d${roll.spec.faces}`,
    effectKind: spell.effectKind,
    damageType: spell.damageType,
    slotLevel,
  };
}

// Item-granted spell (#528): cast from the item's own resource at its configured
// slot level (may upcast above the spell's base level), never a spell slot.
function planItemCast(spell: Spell, character: Character): CastPlan {
  const castLevel = spell.item?.castLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, character, castLevel);
  const result = castRoll ? bannerFor(spell, castRoll, undefined) : null;
  return { ops: [{ type: "castItemSpell", entryId: spell.id, roll: castRoll?.total ?? 0 }], result };
}

// Plan a cast: which ops to send and whether to show a roll banner. Rolls dice
// via computeCastRoll but holds no React state — SpellsSection wires the result.
export function planCast(spell: Spell, character: Character, slotLevel?: number): CastPlan {
  if (spell.source === "item") return planItemCast(spell, character);

  const isCantrip = spell.level === 0;
  const resolvedSlotLevel = slotLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, character, resolvedSlotLevel);

  if (!castRoll) {
    // No effect dice — just expend the slot (cantrips expend nothing).
    const ops: SpellcastingOperation[] = isCantrip
      ? []
      : [{ type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: 0 }];
    return { ops, result: null };
  }

  const result = bannerFor(spell, castRoll, isCantrip ? undefined : slotLevel);
  const op: CastSpellOperation = isCantrip
    ? { type: "castSpell", entryId: spell.id, roll: castRoll.total }
    : { type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: castRoll.total };
  return { ops: [op], result };
}

/**
 * Compute the dice spec for casting `spell` at `slotLevel` — pure, no side
 * effects and no actual rolling. Returns null when the spell has no effect
 * dice (e.g. a utility spell like Detect Magic).
 *
 *  - Cantrip scaling: ×2 at char level 5, ×3 at 11, ×4 at 17.
 *  - Upcast bonus: extraLevels × spell.upcastDicePerLevel added to diceCount.
 *  - Heal spells add the spellcasting ability modifier as a flat bonus.
 */
export function computeCastSpec(
  spell: Spell,
  character: Character,
  slotLevel: number,
): RollSpec | null {
  // Heal spells add the spellcasting ability modifier as a flat bonus.
  const ability = character.spellcasting?.ability;
  const abilityScore = ability
    ? (character.abilityScores[ability as AbilityName] ?? 10)
    : 10;
  const abilityMod = abilityModifier(abilityScore);

  const spec = readEffectSpec(spell);
  const effectiveStep = spell.level === 0 ? 0 : Math.max(0, slotLevel - spell.level);
  return resolveEffectSpec(spec, effectiveStep, { characterLevel: character.level, abilityMod });
}

// Roll the effect dice for casting `spell` at `slotLevel` — null when the spell
// has no effect dice. Internal to planCast; session mode uses computeCastSpec +
// RollContext.roll() so the result surfaces in the shared toast.
function computeCastRoll(
  spell: Spell,
  character: Character,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  const spec = computeCastSpec(spell, character, slotLevel);
  if (!spec) return null;
  const result = rollSpec(spec);
  return { spec, total: result.total, result };
}
