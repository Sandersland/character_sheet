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
import { readEffectSpec, resolveEffectSpec } from "@/lib/effects";
import type { AbilityName, Character, Session, Spell } from "@/types/character";

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

/** A consenting party member a heal can be applied to (#462). */
export interface AllyOption {
  characterId: string;
  name: string;
}

/**
 * Where a cast's effect lands: the caster ("self"), an off-sheet target relayed
 * to the DM ("other"), or a consenting ally's sheet (party-target heal, #462).
 */
export type Target = "self" | "other" | AllyOption;

/** Narrow a Target to a party ally. */
export function isAllyTarget(target: Target): target is AllyOption {
  return typeof target === "object";
}

/** Default target: heal spells or "Self" range → self; everything else → other. */
export function defaultTarget(spell: Spell): Target {
  if (spell.range?.toLowerCase() === "self") return "self";
  if (spell.effectKind === "heal") return "self";
  return "other";
}

/**
 * Opted-in allies a healing cast can target from the live session: present
 * participants (not left) that share the campaign, have autoFriendlyHealing on
 * for this campaign, and aren't the caster. Sorted by name for a stable picker.
 */
export function partyHealAllies(session: Session, selfCharacterId: string): AllyOption[] {
  return (session.participants ?? [])
    .filter((p) => p.characterId !== selfCharacterId && !p.leftAt && p.character)
    .filter((p) =>
      (p.character!.campaignPreferences ?? []).some(
        (pref) => pref.campaignId === session.campaignId && pref.autoFriendlyHealing,
      ),
    )
    .map((p) => ({ characterId: p.characterId, name: p.character!.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const effectiveStep =
    spell.level !== 0 && chosenSlotLevel ? Math.max(0, chosenSlotLevel - spell.level) : 0;
  const roll = resolveEffectSpec(readEffectSpec(spell), effectiveStep, { characterLevel });
  if (!roll) return null;

  return `${roll.count}d${roll.faces}${modifierLabel(roll.modifier ?? 0)} ${effectKindLabel(spell)}`;
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
  const ability = character.spellcasting?.ability;
  const abilityScore = ability
    ? (character.abilityScores[ability as AbilityName] ?? 10)
    : 10;
  const abilityMod = abilityModifier(abilityScore);

  const effectiveStep =
    spell.level !== 0 && chosenSlotLevel ? Math.max(0, chosenSlotLevel - spell.level) : 0;
  const roll = resolveEffectSpec(readEffectSpec(spell), effectiveStep, {
    characterLevel: character.level,
    abilityMod,
  });
  if (!roll) return null;

  return `${roll.count}d${roll.faces}${modifierLabel(roll.modifier ?? 0)} ${effectKindLabel(spell)}`;
}

/** Signed modifier suffix (Unicode minus for negatives, empty for zero). */
function modifierLabel(modifier: number): string {
  if (modifier > 0) return ` + ${modifier}`;
  if (modifier < 0) return ` − ${Math.abs(modifier)}`;
  return "";
}

/** Effect noun for the preview: "healing" for heals, else the damage type. */
function effectKindLabel(spell: Spell): string {
  return spell.effectKind === "heal" ? "healing" : (spell.damageType ?? "damage");
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
 * A cantrip that resolves via a spell **attack roll** (Fire Bolt), so it routes
 * through the in-session attack sheet (#734). `attackType: "save"` cantrips
 * (Sacred Flame) stay in the normal spell picker.
 */
export function isAttackCantrip(spell: Spell): boolean {
  return spell.level === 0 && spell.attackType === "attack";
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
