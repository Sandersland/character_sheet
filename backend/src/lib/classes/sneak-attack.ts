// Sneak Attack rules — the Nd6 progression that character-serialize.ts serves
// as `character.sneakAttack` (relocated from lib/classes/rogue.ts, #1231
// commit 3 of 4; SRD 5.2 keeps 1d6 per 2 levels, capped 10d6 at L19, same as
// SRD 5.1). The roll itself is client-side: it rides the swing's resolveAction
// op as a damage rider (#1843), so there is no server cast handler here.

import { readEffectSpec, resolveEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";

// Sneak Attack is a C5 referenced-class-die consumer: a fixed d6 whose COUNT is
// rogue-level-derived. The die is resolved through the same effects.ts machinery
// (effectDieSource + ClassDieResolver + readEffectSpec) the Battle Master uses,
// but the rogue die never grows, so it needs no resolveClassDie pool.
export const SNEAK_ATTACK_DIE_SOURCE = "sneakAttackDice";

// 1d6 at L1, +1d6 every odd level, capped at 10d6 from L19. 0 below L1.
export function sneakAttackDiceCount(rogueLevel: number): number {
  if (rogueLevel < 1) return 0;
  return Math.min(10, Math.ceil(rogueLevel / 2));
}

// The referenced-class-die resolver for the C5 machinery: the rogue die is a
// flat d6 (never scales with level, unlike the superiority die).
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

// The resolved Nd6 dice for a rogue's Sneak Attack, or null below L1. Routes
// through readEffectSpec/resolveEffectSpec so the die-source resolution matches
// every other referenced-class-die effect.
export function sneakAttackSpec(rogueLevel: number): { count: number; faces: number; modifier: number } | null {
  if (sneakAttackDiceCount(rogueLevel) <= 0) return null;
  const spec = readEffectSpec(sneakAttackEffectRow(rogueLevel), resolveSneakAttackDie);
  // characterLevel receives rogueLevel: die faces (d6) never scale with level —
  // only the count does, already baked into effectDiceCount above.
  return resolveEffectSpec(spec, 0, { characterLevel: rogueLevel });
}

// Sneak Attack scales with ROGUE class levels, not total character level.
function rogueLevel(entries: { name: string; level: number }[]): number {
  return entries.find((c) => c.name.toLowerCase() === "rogue")?.level ?? 0;
}

// The ONE place that resolves "which class entry is the rogue" and hands its
// level to sneakAttackSpec, so character-serialize.ts's sneakAttackRider never
// repeats the `name.toLowerCase() === "rogue"` lookup itself (#1231 commit 3:
// this is what lets character-serialize.ts drop its own `\brogue\b` literal
// entirely).
export function sneakAttackSpecForEntries(
  classEntries: { name: string; level: number }[],
): { count: number; faces: number; modifier: number } | null {
  return sneakAttackSpec(rogueLevel(classEntries));
}
