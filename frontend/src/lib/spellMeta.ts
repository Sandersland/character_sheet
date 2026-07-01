/**
 * spellMeta.ts — pure display helpers for spells.
 *
 * Shared between InlineSpellPicker (session turn panel) and SpellRow/SpellsSection
 * (character sheet reference) so both surfaces render identical metadata without
 * duplicating logic.
 *
 * No React, no JSX, no side effects.
 */

import { abilityLabel, abilityModifier } from "@/lib/abilities";
import type { AbilityName, Character, Spell } from "@/types/character";

/**
 * Human-readable school-tone mapping (mirrors SpellRow.tsx SCHOOL_TONE but
 * exported here so InlineSpellPicker can share it).
 */
export const SCHOOL_TONE = {
  abjuration:   "arcane",
  conjuration:  "arcane",
  divination:   "gold",
  enchantment:  "garnet",
  evocation:    "garnet",
  illusion:     "arcane",
  necromancy:   "neutral",
  transmutation: "gold",
} as const;

export type SchoolTone = (typeof SCHOOL_TONE)[keyof typeof SCHOOL_TONE];

/** Whether a spell is applied to the caster or an external target. */
export type Target = "self" | "other";

/** Default target: heal spells or "Self" range → self; everything else → other. */
export function defaultTarget(spell: Spell): Target {
  if (spell.range?.toLowerCase() === "self") return "self";
  if (spell.effectKind === "heal") return "self";
  return "other";
}

/** True when the target is locked to "self" (range is exactly "Self"). */
export function targetLocked(spell: Spell): boolean {
  return spell.range?.toLowerCase() === "self";
}

/** "Cantrip" or "Level N" */
export function levelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

/**
 * Returns the effect preview string for a spell at a given slot level
 * (e.g. "8d6 fire damage" / "2d4 healing").
 *
 * Respects cantrip scaling at `characterLevel` and upcast dice when a
 * higher slot is chosen. Returns null for utility spells with no effect dice.
 *
 * Set `chosenSlotLevel` to the slot the player picked; omit for the base
 * display (uses spell.level as the slot level so no upcast bonus).
 */
export function effectPreview(
  spell: Spell,
  characterLevel: number,
  chosenSlotLevel?: number,
): string | null {
  if (!spell.effectKind || !spell.effectDiceCount || !spell.effectDiceFaces) return null;

  const isCantrip = spell.level === 0;
  let count = spell.effectDiceCount;

  if (spell.cantripScaling && isCantrip) {
    if (characterLevel >= 17) count *= 4;
    else if (characterLevel >= 11) count *= 3;
    else if (characterLevel >= 5) count *= 2;
  }

  if (!isCantrip && chosenSlotLevel && spell.upcastDicePerLevel) {
    const extraLevels = Math.max(0, chosenSlotLevel - spell.level);
    count += extraLevels * spell.upcastDicePerLevel;
  }

  const mod = spell.effectModifier
    ? spell.effectModifier > 0
      ? ` + ${spell.effectModifier}`
      : ` − ${Math.abs(spell.effectModifier)}`
    : "";

  const kind =
    spell.effectKind === "heal" ? "healing" : (spell.damageType ?? "damage");

  return `${count}d${spell.effectDiceFaces}${mod} ${kind}`;
}

/**
 * Like effectPreview but adds the spellcasting ability modifier to healing
 * (mirrors computeCastRoll). Intended for the "after you cast" result display.
 */
export function effectPreviewWithMod(
  spell: Spell,
  character: Character,
  chosenSlotLevel?: number,
): string | null {
  if (!spell.effectKind || !spell.effectDiceCount || !spell.effectDiceFaces) return null;

  const isCantrip = spell.level === 0;
  let count = spell.effectDiceCount;

  if (spell.cantripScaling && isCantrip) {
    const lvl = character.level;
    if (lvl >= 17) count *= 4;
    else if (lvl >= 11) count *= 3;
    else if (lvl >= 5) count *= 2;
  }

  if (!isCantrip && chosenSlotLevel && spell.upcastDicePerLevel) {
    const extraLevels = Math.max(0, chosenSlotLevel - spell.level);
    count += extraLevels * spell.upcastDicePerLevel;
  }

  const ability = character.spellcasting?.ability;
  const abilityScore = ability
    ? (character.abilityScores[ability as AbilityName] ?? 10)
    : 10;
  const abilityMod = abilityModifier(abilityScore);

  let modifier = spell.effectModifier ?? 0;
  if (spell.effectKind === "heal") modifier += abilityMod;

  const modStr = modifier > 0
    ? ` + ${modifier}`
    : modifier < 0
      ? ` − ${Math.abs(modifier)}`
      : "";

  const kind =
    spell.effectKind === "heal" ? "healing" : (spell.damageType ?? "damage");

  return `${count}d${spell.effectDiceFaces}${modStr} ${kind}`;
}

/**
 * Component letters for the "V S M" components line.
 * Returns null when spell.components is absent (legacy spells).
 */
export function componentsLabel(spell: Spell): string | null {
  if (!spell.components) return null;
  const parts: string[] = [];
  if (spell.components.verbal) parts.push("V");
  if (spell.components.somatic) parts.push("S");
  if (spell.components.material) parts.push("M");
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Attack-type line for the expand section.
 * Returns null for utility spells.
 */
export function attackTypeLabel(spell: Spell): string | null {
  if (!spell.attackType) return null;
  if (spell.attackType === "attack") return "Ranged/melee spell attack";
  // save spell
  const savePart = spell.saveAbility ? abilityLabel(spell.saveAbility) : "—";
  const effectPart =
    spell.saveEffect === "half"
      ? " · half damage on success"
      : spell.saveEffect === "none"
        ? " · no effect on success"
        : "";
  return `${savePart} saving throw${effectPart}`;
}

/**
 * Save DC display string (for InlineSpellPicker attack-vs-save surface).
 */
export function saveDcLabel(spell: Spell, spellSaveDC: number): string | null {
  if (spell.attackType !== "save" || !spell.saveAbility) return null;
  return `DC ${spellSaveDC} ${abilityLabel(spell.saveAbility)} save`;
}

/**
 * Upcast hint line (e.g. "+1d6 per level above 3rd").
 */
export function upcastHint(spell: Spell): string | null {
  if (spell.level === 0 || !spell.upcastDicePerLevel || !spell.effectDiceFaces) return null;
  return `Upcast: +${spell.upcastDicePerLevel}d${spell.effectDiceFaces} per slot level above ${spell.level}`;
}
