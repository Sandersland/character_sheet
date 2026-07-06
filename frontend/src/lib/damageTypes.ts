import type { ActiveBuff } from "@/types/character";

// The 13 standard 5e damage types, used to populate the damage-type picker (#456).
export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Title-case a damage type for display (e.g. "slashing" → "Slashing"). */
export function damageTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Self-scoped resistance registry: damage types the active buffs currently resist. */
export function activeResistedDamageTypes(buffs: ActiveBuff[]): Set<string> {
  const out = new Set<string>();
  for (const b of buffs) {
    for (const t of b.resistDamageTypes ?? []) out.add(t);
  }
  return out;
}
