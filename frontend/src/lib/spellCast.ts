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
import type { AbilityName, Character, Spell } from "@/types/character";
import type { RollSpec, RollResult } from "@/lib/dice";

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

/**
 * Roll the effect dice for casting `spell` at `slotLevel`. Returns null when
 * the spell has no effect dice (same condition as computeCastSpec).
 *
 * Use this in out-of-session contexts (SpellsSection) where the caller owns
 * the random roll. In session mode (InlineSpellPicker) prefer `computeCastSpec`
 * + `RollContext.roll()` so the result surfaces in the shared toast.
 */
export function computeCastRoll(
  spell: Spell,
  character: Character,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  const spec = computeCastSpec(spell, character, slotLevel);
  if (!spec) return null;
  const result = rollSpec(spec);
  return { spec, total: result.total, result };
}
