import type { ActiveBuff } from "@/types/character";

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

export function damageTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function activeResistedDamageTypes(buffs: ActiveBuff[]): Set<string> {
  const out = new Set<string>();
  for (const b of buffs) {
    for (const t of b.resistDamageTypes ?? []) out.add(t);
  }
  return out;
}
