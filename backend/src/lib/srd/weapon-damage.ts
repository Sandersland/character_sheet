import { weaponAbilityMod } from "@/lib/srd/proficiencies.js";
import { abilityModifier } from "@/lib/srd/math.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { RulesEdition, WeaponGrip } from "@character-sheet/shared-types";

// Re-exported so importers reaching for it through the `srd.js` barrel keep
// resolving, while the one declaration is the wire type behind `AttackRow.grip`.
export type { WeaponGrip };

/**
 * Derives the damage roll spec for a weapon, choosing the correct die for
 * versatile weapons based on what else is equipped.
 *
 * Grip rule (PHB'14 p. 146-147 / SRD 5.2, weapon properties Versatile + Two-Handed):
 *   - `twoHanded` weapons always use their base dice (no off-hand applies).
 *   - Versatile weapons use their **two-handed die** when the off-hand is free
 *     (no equipped shield and no other equipped weapon). Otherwise one-handed.
 *   - All other weapons use their base dice.
 *
 * Damage modifier follows the same ability-selection rule as attackBonus
 * (ranged → DEX, finesse → max(STR, DEX), else STR) so attack and damage stay
 * consistent and we never duplicate that rule.
 *
 * `abilityModifier` is returned as a separate component (the governing ability
 * mod, before the melee buff) because the Two-Weapon Fighting off-hand rule
 * subtracts exactly that component — see `deriveOffHandDamage`, the one place
 * that rule lives (#1434; it used to be re-derived on the client, #732).
 *
 * `meleeDamageBonus` is the OTHER addend folded into `damageModifier` (an active
 * "meleeDamage" buff, e.g. Rage) — surfaced alongside `abilityModifier` for the
 * combat-log decomposition (#1235); `abilityModifier + meleeDamageBonus ===
 * damageModifier` always, by construction (never re-derive it separately).
 *
 * `ability` names which score `abilityModifier` came from (#1361) — delegated
 * to `weaponAbilityMod`, the one place the finesse/ranged choice is decided.
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
  abilityModifier: number;
  /** The applied melee-damage buff addend — 0 (not omitted) for a ranged weapon or no active buff. */
  meleeDamageBonus: number;
  damageType: string;
  grip: WeaponGrip;
  /** The ability `abilityModifier` came from — see `weaponAbilityMod`. */
  ability: "strength" | "dexterity";
} {
  const isMelee = weapon.weaponRange === "melee";
  const { mod: abilityMod, ability } = weaponAbilityMod(weapon, effectiveScores);
  const appliedMeleeDamageBonus = isMelee ? meleeDamageBonus : 0;
  const damageModifier = abilityMod + appliedMeleeDamageBonus;

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

  return {
    damageDiceCount,
    damageDiceFaces,
    damageModifier,
    abilityModifier: abilityMod,
    meleeDamageBonus: appliedMeleeDamageBonus,
    damageType: weapon.damageType,
    grip,
    ability,
  };
}

/** The damage decomposition `deriveOffHandDamage` adjusts — a `deriveWeaponDamage` result, or any shape carrying those addends. */
interface OffHandDamageInput {
  damageModifier: number;
  abilityModifier?: number;
}

/**
 * Two-Weapon Fighting: the off-hand attack's damage.
 *
 * The extra off-hand attack does not add the governing ability modifier to its
 * damage unless that modifier is negative — PHB'14 p. 195 (Two-Weapon Fighting)
 * and SRD 5.2 (Light property) state the same rule, and the Two-Weapon Fighting
 * fighting style restores the modifier in both, so this takes no `edition`.
 * `Math.max(0, …)` is that "unless negative" clause: only a positive modifier
 * is dropped.
 *
 * `keepAbilityModifier` is the caller-resolved eligibility check — as of #1640
 * that's `hasOffHandAbilityDamage`'s composite of "style taken" AND "both
 * equipped weapons are Light" (`bothWeaponsLight`), not the style alone.
 *
 * Returns the input with `damageModifier` AND `abilityModifier` reduced by the
 * same amount, which is what keeps `deriveWeaponDamage`'s
 * `abilityModifier + meleeDamageBonus === damageModifier` invariant true through
 * the adjustment — so a logged off-hand damage roll's components still sum to
 * what was rolled (#1235). Any other addend folded into `damageModifier` (an
 * active meleeDamage buff, e.g. Rage) survives untouched.
 *
 * An absent `abilityModifier` means the decomposition is unknown, and an unknown
 * amount must never be subtracted — the full modifier is kept, which is also the
 * behaviour a weapon row serialized before #732 has always had.
 */
export function deriveOffHandDamage<T extends OffHandDamageInput>(
  damage: T,
  keepAbilityModifier: boolean,
): T {
  const abilityMod = damage.abilityModifier;
  if (keepAbilityModifier || abilityMod === undefined) return damage;
  const dropped = Math.max(0, abilityMod);
  return {
    ...damage,
    damageModifier: damage.damageModifier - dropped,
    abilityModifier: abilityMod - dropped,
  };
}

/**
 * Whether both weapons in a two-weapon-fighting pair have the Light property —
 * PHB'14 p. 195's Two-Weapon Fighting combat rule requires "a light melee
 * weapon … in one hand … a different light melee weapon … in the other hand",
 * a condition the p. 72 fighting style inherits by reference rather than
 * restating; SRD 5.2 / PHB'24 states the same condition inline ("while
 * wielding a weapon that has the Light property in each hand"). The editions
 * agree, so this takes no `edition` parameter (#1640).
 *
 * Mirrors the frontend's `canTwoWeaponFight` (turnRules.ts, post-#1496) —
 * both weapons of the pair, not just one, must be Light. There are never more
 * than two equipped weapons (weapon placement is MAIN_HAND/OFF_HAND only), so
 * `every` over the full array is exactly the two-weapon check.
 */
export function bothWeaponsLight(weapons: ReadonlyArray<{ light: boolean }>): boolean {
  return weapons.length >= 2 && weapons.every((w) => w.light);
}

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

// Monk Martial Arts die by monk class level. SRD 5.1 / PHB'14 p.78: 1d4 (L1-4),
// 1d6 (L5-10), 1d8 (L11-16), 1d10 (L17-20). SRD 5.2 / PHB'24 p.88: 1d6 (L1-4),
// 1d8 (L5-10), 1d10 (L11-16), 1d12 (L17-20). The level bands (L5/L11/L17
// thresholds) are identical across editions — only the die faces fork (#1499).
// Returns 0 below monk level 1 (non-monk or no monk levels) in both editions.
export function deriveMartialArtsDie(monkLevel: number, edition: RulesEdition): number {
  if (monkLevel < 1) return 0;
  if (edition === "EDITION_2014") {
    if (monkLevel >= 17) return 10;
    if (monkLevel >= 11) return 8;
    if (monkLevel >= 5) return 6;
    return 4;
  }
  if (monkLevel >= 17) return 12;
  if (monkLevel >= 11) return 10;
  if (monkLevel >= 5) return 8;
  return 6;
}

/**
 * Derives the unarmed-strike attack bonus and damage spec for a character.
 * Unarmed strikes are always proficient (5e PHB) and default to STR.
 * `unarmedDamageDie` is 1 by default (flat 1 + STR mod) and is raised to 4
 * by Tavern Brawler. A Monk who is unarmored & unshielded uses max(Dex, Str)
 * for attack + damage and the larger of the feat die and the Martial Arts die.
 * Empowered Strikes (monk L6+) marks the strike `magical`, off monk level.
 */
export function deriveUnarmedStrike(
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  unarmedDamageDie: number,
  monk: { level: number; isUnarmored: boolean; hasShield: boolean } | undefined,
  edition: RulesEdition,
): {
  attackBonus: number;
  magical: boolean;
  damage: { count: number; faces: number; modifier: number; damageType: string };
} {
  const strMod = abilityModifier(effectiveScores.strength ?? 10);
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  // Martial Arts only applies unarmored & unshielded; 0 otherwise (fall back to STR).
  const martialArtsDie =
    monk && monk.isUnarmored && !monk.hasShield ? deriveMartialArtsDie(monk.level, edition) : 0;
  const abilityMod = martialArtsDie > 0 ? Math.max(strMod, dexMod) : strMod;
  // Empowered Strikes: monk unarmed strikes count as magical at level 6+.
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
