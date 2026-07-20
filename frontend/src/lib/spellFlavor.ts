// Spell-school + damage-type flavor classes for the shared spell picker (#1160).
// Colors ride the --color-school-* / --color-dmg-* @theme tokens; the ribbon and
// pill fills reuse the same ink at a /15 opacity modifier so a single token per
// hue drives both text and tint and stays theme-aware.
import type { SpellSchool } from "@/types/character";

/** Ink (text) class for a school — the spell name's school-tinted accent. */
export function schoolInk(school: SpellSchool): string {
  return `text-school-${school}`;
}

/** Ribbon-badge classes for a school: the ink over its own low-opacity tint. */
export function schoolRibbon(school: SpellSchool): string {
  return `bg-school-${school}/15 text-school-${school}`;
}

// Several 5e damage types share one tint token (acid→poison, lightning/thunder→
// force); anything unmapped (or absent) falls back to the neutral parchment pill.
const DAMAGE_TOKEN: Record<string, string> = {
  fire: "fire",
  cold: "cold",
  poison: "poison",
  acid: "poison",
  necrotic: "necrotic",
  radiant: "radiant",
  psychic: "psychic",
  force: "force",
  lightning: "force",
  thunder: "force",
};

const NEUTRAL_PILL = "bg-parchment-100 text-parchment-600";

/** Pill classes tinted to a damage type, or a neutral pill for unknown/absent. */
export function damagePillClass(damageType: string | null | undefined): string {
  const token = damageType ? DAMAGE_TOKEN[damageType] : undefined;
  return token ? `bg-dmg-${token}/15 text-dmg-${token}` : NEUTRAL_PILL;
}
