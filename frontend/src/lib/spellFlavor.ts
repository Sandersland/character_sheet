// Ribbon/pill fills reuse the ink at a /15 opacity modifier so one token per hue
// drives both text and tint and stays theme-aware.
import type { SpellSchool } from "@/types/character";

export function schoolInk(school: SpellSchool): string {
  return `text-school-${school}`;
}

export function schoolRibbon(school: SpellSchool): string {
  return `bg-school-${school}/15 text-school-${school}`;
}

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

export function damagePillClass(damageType: string | null | undefined): string {
  const token = damageType ? DAMAGE_TOKEN[damageType] : undefined;
  return token ? `bg-dmg-${token}/15 text-dmg-${token}` : NEUTRAL_PILL;
}
