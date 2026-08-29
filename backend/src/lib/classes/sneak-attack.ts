// Sneak Attack: 1d6 per 2 levels, capped 10d6 at L19 — edition-invariant (SRD 5.1 = SRD 5.2).
// The roll is client-side: it rides the swing's resolveAction op as a damage rider — there is no server cast handler here.

import { readEffectSpec, resolveEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";

export const SNEAK_ATTACK_DIE_SOURCE = "sneakAttackDice";

export function sneakAttackDiceCount(rogueLevel: number): number {
  if (rogueLevel < 1) return 0;
  return Math.min(10, Math.ceil(rogueLevel / 2));
}

// Flat d6 — never scales with level, unlike the superiority die.
export const resolveSneakAttackDie: ClassDieResolver = (source) =>
  source === SNEAK_ATTACK_DIE_SOURCE ? 6 : null;

function sneakAttackEffectRow(rogueLevel: number): EffectRow {
  return {
    level: 1,
    effectKind: "damage",
    effectDiceCount: sneakAttackDiceCount(rogueLevel),
    effectDieSource: SNEAK_ATTACK_DIE_SOURCE,
  };
}

export function sneakAttackSpec(rogueLevel: number): { count: number; faces: number; modifier: number } | null {
  if (sneakAttackDiceCount(rogueLevel) <= 0) return null;
  const spec = readEffectSpec(sneakAttackEffectRow(rogueLevel), resolveSneakAttackDie);
  // characterLevel receives rogueLevel here — die faces never scale with level, only the count (already baked into effectDiceCount above).
  return resolveEffectSpec(spec, 0, { characterLevel: rogueLevel });
}

// Sneak Attack scales with ROGUE class levels, not total character level.
function rogueLevel(entries: { name: string; level: number }[]): number {
  return entries.find((c) => c.name.toLowerCase() === "rogue")?.level ?? 0;
}

// The ONE place that resolves which class entry is the rogue — sneakAttackRider must never repeat the name.toLowerCase() === "rogue" lookup itself.
export function sneakAttackSpecForEntries(
  classEntries: { name: string; level: number }[],
): { count: number; faces: number; modifier: number } | null {
  return sneakAttackSpec(rogueLevel(classEntries));
}
