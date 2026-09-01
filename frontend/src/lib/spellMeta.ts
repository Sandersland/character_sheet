// Shared between InlineSpellPicker and SpellRow/SpellsSection so both render
// identical spell metadata without duplicating logic.
import { abilityLabel } from "@/lib/abilities";
import type { Session, Spell, SpellComponents, SpellSchool } from "@/types/character";

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

// Mirrors SpellRow's own SCHOOL_TONE constant; exported here so InlineSpellPicker
// can share it too.
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

export interface AllyOption {
  characterId: string;
  name: string;
}

// "other" means an off-sheet target relayed to the DM, not a modeled creature.
export type Target = "self" | "other" | AllyOption;

export function isAllyTarget(target: Target): target is AllyOption {
  return typeof target === "object";
}

export function defaultTarget(spell: Spell): Target {
  if (spell.range?.toLowerCase() === "self") return "self";
  if (spell.effectKind === "heal") return "self";
  return "other";
}

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

export function targetLocked(spell: Spell): boolean {
  return spell.range?.toLowerCase() === "self";
}

export function levelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

const SLOT_ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export function slotOrdinal(n: number): string {
  return SLOT_ORDINALS[n] ?? `${n}th`;
}

// Reads the served effectRolls (#1381); the roll always includes the heal
// ability modifier per SRD 5.1/5.2 Cure Wounds. `roll` is always per-instance
// dice (Scorching Ray's 2d6, not a combined 6d6), so a multi-instance entry
// (#1981/#1986) needs the same "N × " prefix catalogEffectLine already uses —
// without it this read like one 2d6 roll instead of three.
export function effectPreview(spell: Spell, chosenSlotLevel?: number): string | null {
  const slotLevel = chosenSlotLevel ?? spell.level;
  const entry = spell.effectRolls?.find((e) => e.slotLevel === slotLevel);
  // effectRolls is a JSON column — a row can carry roll: null despite the non-nullable wire type.
  if (!entry?.roll) return null;
  const { roll, instanceCount } = entry;
  const prefix = instanceCount && instanceCount > 1 ? `${instanceCount} × ` : "";

  return `${prefix}${roll.count}d${roll.faces}${modifierLabel(roll.modifier ?? 0)} ${effectKindLabel(spell)}`;
}

function modifierLabel(modifier: number): string {
  if (modifier > 0) return ` + ${modifier}`;
  if (modifier < 0) return ` − ${Math.abs(modifier)}`;
  return "";
}

function effectKindLabel(spell: Spell): string {
  return spell.effectKind === "heal" ? "healing" : (spell.damageType ?? "damage");
}

export function componentsLabel(spell: { components?: SpellComponents | null }): string | null {
  if (!spell.components) return null;
  const parts: string[] = [];
  if (spell.components.verbal) parts.push("V");
  if (spell.components.somatic) parts.push("S");
  if (spell.components.material) parts.push("M");
  return parts.length > 0 ? parts.join(" ") : null;
}

// Attack-roll cantrips (Fire Bolt) route to the in-session attack sheet (#734);
// save cantrips (Sacred Flame) stay in the spell picker.
export function isAttackCantrip(spell: Spell): boolean {
  return spell.level === 0 && spell.attackType === "attack";
}

export function saveDcLabel(spell: Spell, spellSaveDC: number): string | null {
  if (spell.attackType !== "save" || !spell.saveAbility) return null;
  return `DC ${spellSaveDC} ${abilityLabel(spell.saveAbility)} save`;
}

// Multi-instance rows (#1981/#1984) can set upcastDicePerLevel and upcastInstancesPerLevel
// independently (readEffectSpec's resolveEffectScaling — either alone selects slotUpcast), so this
// composes whichever clauses are present rather than picking one.
export function upcastHint(
  spell: Pick<Spell, "level" | "upcastDicePerLevel" | "effectDiceFaces" | "upcastInstancesPerLevel">,
): string | null {
  if (spell.level === 0) return null;
  const clauses: string[] = [];
  if (spell.upcastDicePerLevel && spell.effectDiceFaces) {
    clauses.push(`+${spell.upcastDicePerLevel}d${spell.effectDiceFaces}`);
  }
  if (spell.upcastInstancesPerLevel) {
    clauses.push(`+${spell.upcastInstancesPerLevel} instance${spell.upcastInstancesPerLevel === 1 ? "" : "s"}`);
  }
  if (clauses.length === 0) return null;
  return `Upcast: ${clauses.join(" and ")} per slot level above ${spell.level}`;
}
