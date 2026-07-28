/**
 * spellMeta.ts — pure display helpers for spells.
 *
 * Shared between InlineSpellPicker (session turn panel) and SpellRow/SpellsSection
 * (character sheet reference) so both surfaces render identical metadata without
 * duplicating logic.
 *
 * No React, no JSX, no side effects.
 */

import { abilityLabel } from "@/lib/abilities";
import type { Session, Spell, SpellComponents, SpellSchool } from "@/types/character";

/** Title-case display label for a spell school (never render the raw key). */
const SCHOOL_LABELS: Record<SpellSchool, string> = {
  abjuration: "Abjuration",
  conjuration: "Conjuration",
  divination: "Divination",
  enchantment: "Enchantment",
  evocation: "Evocation",
  illusion: "Illusion",
  necromancy: "Necromancy",
  transmutation: "Transmutation",
};

export function schoolLabel(school: SpellSchool): string {
  return SCHOOL_LABELS[school] ?? school;
}

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

const SLOT_ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

// Ordinal for a spell/slot level ("3rd") — the slot-pip, roster, cast-door
// picker, and in-session picker level tag.
export function slotOrdinal(n: number): string {
  return SLOT_ORDINALS[n] ?? `${n}th`;
}

/**
 * Effect preview string for a spell at a given slot level (e.g. "8d6 fire
 * damage" / "2d8 + 3 healing") — a lookup into the spell's served
 * `effectRolls` (#1381), not a re-derivation. The served roll always carries
 * the spellcasting ability modifier for a heal (SRD 5.2/5.1 Cure Wounds:
 * "plus your spellcasting ability modifier"), so this single function now
 * renders identically for the grimoire and the in-session picker — collapsing
 * the former effectPreview/effectPreviewWithMod split, which used to omit the
 * modifier here and understate the grimoire's heal preview.
 *
 * Set `chosenSlotLevel` to the slot the player picked; omit for the base
 * display (looks up spell.level, i.e. no upcast bonus). Returns null when the
 * spell has no served roll at that level (a utility spell, or an unlisted level).
 */
export function effectPreview(spell: Spell, chosenSlotLevel?: number): string | null {
  const slotLevel = chosenSlotLevel ?? spell.level;
  const roll = spell.effectRolls?.find((e) => e.slotLevel === slotLevel)?.roll;
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
export function componentsLabel(spell: { components?: SpellComponents | null }): string | null {
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
 * Save DC display string (for InlineSpellPicker attack-vs-save surface).
 */
export function saveDcLabel(spell: Spell, spellSaveDC: number): string | null {
  if (spell.attackType !== "save" || !spell.saveAbility) return null;
  return `DC ${spellSaveDC} ${abilityLabel(spell.saveAbility)} save`;
}

/**
 * Upcast hint line (e.g. "+1d6 per level above 3rd").
 */
export function upcastHint(
  spell: Pick<Spell, "level" | "upcastDicePerLevel" | "effectDiceFaces">,
): string | null {
  if (spell.level === 0 || !spell.upcastDicePerLevel || !spell.effectDiceFaces) return null;
  return `Upcast: +${spell.upcastDicePerLevel}d${spell.effectDiceFaces} per slot level above ${spell.level}`;
}
