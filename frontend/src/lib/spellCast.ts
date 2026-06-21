/**
 * spellCast.ts — pure computation helpers for spell casting rolls.
 *
 * Extracted from SpellsSection.handleCast so session-mode components
 * (TurnHub's future InlineSpellPicker) can produce the same roll without
 * duplicating the cantrip-scaling / upcast-dice / heal-modifier math.
 *
 * No React, no JSX, no side effects — output is deterministic given the inputs.
 */

import { rollSpec } from "@/lib/dice";
import { abilityModifier } from "@/lib/abilities";
import type { AbilityName, Character, Spell } from "@/types/character";
import type { RollSpec, RollResult } from "@/lib/dice";

/**
 * Compute the roll spec and result for casting `spell` at `slotLevel`.
 *
 * Returns null when the spell has no effect dice (e.g. a utility spell
 * like Detect Magic — the caller should expend the slot without showing a roll).
 *
 * Mirrors the logic in SpellsSection.handleCast exactly:
 *  - Cantrip scaling: ×2 at char level 5, ×3 at 11, ×4 at 17.
 *  - Upcast bonus: extraLevels × spell.upcastDicePerLevel added to diceCount.
 *  - Heal spells add the spellcasting ability modifier as a flat bonus.
 */
export function computeCastRoll(
  spell: Spell,
  character: Character,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  // No dice = no roll.
  if (!spell.effectKind || !spell.effectDiceCount || !spell.effectDiceFaces) {
    return null;
  }

  const isCantrip = spell.level === 0;

  // Cantrip scaling.
  let diceCount = spell.effectDiceCount;
  if (spell.cantripScaling && isCantrip) {
    if (character.level >= 17) diceCount *= 4;
    else if (character.level >= 11) diceCount *= 3;
    else if (character.level >= 5) diceCount *= 2;
  }

  // Upcast bonus.
  if (!isCantrip && slotLevel && spell.upcastDicePerLevel) {
    const extraLevels = Math.max(0, slotLevel - spell.level);
    diceCount += extraLevels * spell.upcastDicePerLevel;
  }

  // Flat modifier: heal spells add the spellcasting ability modifier.
  const ability = character.spellcasting?.ability;
  const abilityScore = ability
    ? (character.abilityScores[ability as AbilityName] ?? 10)
    : 10;
  const abilityMod = abilityModifier(abilityScore);

  let modifier = spell.effectModifier ?? 0;
  if (spell.effectKind === "heal") {
    modifier += abilityMod;
  }

  const spec: RollSpec = { count: diceCount, faces: spell.effectDiceFaces, modifier };
  const result = rollSpec(spec);

  return { spec, total: result.total, result };
}
