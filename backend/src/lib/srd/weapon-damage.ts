import { weaponAbilityMod } from "@/lib/srd/proficiencies.js";
import { abilityModifier } from "@/lib/srd/math.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";

export type WeaponGrip = "one-handed" | "two-handed" | "versatile-two-handed";

/**
 * Derives the damage roll spec for a weapon, choosing the correct die for
 * versatile weapons based on what else is equipped.
 *
 * Grip rule (5e PHB):
 *   - `twoHanded` weapons always use their base dice (no off-hand applies).
 *   - Versatile weapons use their **two-handed die** when the off-hand is free
 *     (no equipped shield and no other equipped weapon). Otherwise one-handed.
 *   - All other weapons use their base dice.
 *
 * Damage modifier follows the same ability-selection rule as attackBonus
 * (ranged → DEX, finesse → max(STR, DEX), else STR) so attack and damage stay
 * consistent and we never duplicate that rule.
 */
export function deriveWeaponDamage(
  weapon: {
    name: string;
    finesse: boolean;
    weaponRange?: string | null;
    damageDiceCount: number;
    damageDiceFaces: number;
    damageType: string;
    versatileDiceCount?: number | null;
    versatileDiceFaces?: number | null;
    twoHanded: boolean;
  },
  /** True if any other equipped item occupies the off-hand (shield or weapon). */
  offHandOccupied: boolean,
  effectiveScores: Record<string, number>,
  /** Flat bonus from active "meleeDamage" buffs (e.g. Rage); melee weapons only. */
  meleeDamageBonus = 0,
): {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier: number;
  damageType: string;
  grip: WeaponGrip;
} {
  const isMelee = weapon.weaponRange === "melee";
  const damageModifier = weaponAbilityMod(weapon, effectiveScores) + (isMelee ? meleeDamageBonus : 0);

  // Resolve grip and choose dice.
  const isVersatile =
    weapon.versatileDiceCount != null && weapon.versatileDiceFaces != null;
  const useTwoHandedDie = isVersatile && !offHandOccupied && !weapon.twoHanded;

  const damageDiceCount = useTwoHandedDie
    ? weapon.versatileDiceCount!
    : weapon.damageDiceCount;
  const damageDiceFaces = useTwoHandedDie
    ? weapon.versatileDiceFaces!
    : weapon.damageDiceFaces;

  const grip: WeaponGrip = weapon.twoHanded
    ? "two-handed"
    : useTwoHandedDie
      ? "versatile-two-handed"
      : "one-handed";

  return { damageDiceCount, damageDiceFaces, damageModifier, damageType: weapon.damageType, grip };
}

// ── Unarmed strike + improvised weapon derivation ─────────────────────────────

/**
 * Returns the unarmed-strike damage die face count for the given advancements.
 * Default is 1 (1 + STR mod, minimum 1 per 5e PHB). Tavern Brawler raises it to
 * d4 via a `{ target: "unarmedDamageDie", amount: 4 }` improvement. When multiple
 * feats would affect this (future-proofing), the max wins — you never "downgrade"
 * a damage die.
 */
export function deriveUnarmedDamageDie(advancements: AdvancementEntry[]): number {
  let best = 1; // default: "1" (flat 1 + STR mod, minimum 1)
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "unarmedDamageDie") {
        best = Math.max(best, imp.amount);
      }
    }
  }
  return best;
}

// Monk Martial Arts die by monk class level (PHB p.78): d4 at L1, d6/d8/d10 at
// L5/L11/L17. Returns 0 below monk level 1 (non-monk or no monk levels).
export function deriveMartialArtsDie(monkLevel: number): number {
  if (monkLevel < 1) return 0;
  if (monkLevel >= 17) return 10;
  if (monkLevel >= 11) return 8;
  if (monkLevel >= 5) return 6;
  return 4;
}

/**
 * Derives the unarmed-strike attack bonus and damage spec for a character.
 * Unarmed strikes are always proficient (5e PHB) and default to STR.
 * `unarmedDamageDie` is 1 by default (flat 1 + STR mod) and is raised to 4
 * by Tavern Brawler. A Monk who is unarmored & unshielded uses max(Dex, Str)
 * for attack + damage and the larger of the feat die and the Martial Arts die.
 * Ki-Empowered Strikes (monk L6+) marks the strike `magical`, off monk level.
 */
export function deriveUnarmedStrike(
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  unarmedDamageDie: number,
  monk?: { level: number; isUnarmored: boolean; hasShield: boolean },
): {
  attackBonus: number;
  magical: boolean;
  damage: { count: number; faces: number; modifier: number; damageType: string };
} {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  // Martial Arts only applies unarmored & unshielded; 0 otherwise (fall back to STR).
  const martialArtsDie =
    monk && monk.isUnarmored && !monk.hasShield ? deriveMartialArtsDie(monk.level) : 0;
  const abilityMod = martialArtsDie > 0 ? Math.max(strMod, dexMod) : strMod;
  // Ki-Empowered Strikes: monk unarmed strikes count as magical at level 6+.
  const magical = (monk?.level ?? 0) >= 6;
  return {
    attackBonus: abilityMod + proficiencyBonus,
    magical,
    damage: {
      count: 1,
      faces: Math.max(unarmedDamageDie, martialArtsDie),
      modifier: Math.max(0, abilityMod), // d1 baseline guarantees at least 1 total
      damageType: "bludgeoning",
    },
  };
}

/**
 * Derives the improvised-weapon attack bonus and damage spec for a character.
 * Per 5e PHB: improvised weapons deal 1d4 bludgeoning and use STR. A character
 * is normally **not** proficient with improvised weapons unless they have Tavern
 * Brawler (which grants a `weaponProficiency` for "Improvised Weapons").
 */
export function deriveImprovisedAttack(
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  proficient: boolean,
): {
  attackBonus: number;
  proficient: boolean;
  damage: { count: number; faces: number; modifier: number; damageType: string };
} {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  return {
    attackBonus: strMod + (proficient ? proficiencyBonus : 0),
    proficient,
    damage: { count: 1, faces: 4, modifier: strMod, damageType: "bludgeoning" },
  };
}
