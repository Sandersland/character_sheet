// The 13 standard 5e damage types (lowercase keys) — mirror of backend
// src/lib/srd.ts DAMAGE_TYPES. Used by the HP damage-entry flow (#456).

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

// Damage types are simple single lowercase words — a plain capitalize is safe
// here (unlike camelCase skill/ability keys, which need skillLabel/abilityLabel).
export function damageTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export const DAMAGE_TYPE_OPTIONS: { value: DamageType; label: string }[] = DAMAGE_TYPES.map((t) => ({
  value: t,
  label: damageTypeLabel(t),
}));
