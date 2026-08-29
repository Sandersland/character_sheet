import { weaponAbilityMod } from "@/lib/srd/proficiencies.js";
import { abilityModifier } from "@/lib/srd/math.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { RulesEdition, WeaponGrip } from "@character-sheet/shared-types";

// Re-exported through the srd barrel; the one declaration is the wire type behind `AttackRow.grip`.
export type { WeaponGrip };

// Grip rule (PHB'14 p. 146-147 / SRD 5.2, Versatile + Two-Handed): two-handed weapons always use their base dice; versatile weapons use their two-handed die when the off-hand is free (no shield, no other weapon), else one-handed; everything else uses base dice.
// Damage modifier follows the same ability-selection rule as attackBonus (weaponAbilityMod) so attack and damage never disagree.
// `abilityModifier` is a separate return component because `deriveOffHandDamage` subtracts exactly that component for the Two-Weapon Fighting off-hand rule (#1434).
// `meleeDamageBonus` is the other addend folded into `damageModifier` (e.g. Rage) — `abilityModifier + meleeDamageBonus === damageModifier` always, by construction (#1235). `ability` names which score `abilityModifier` came from (#1361).
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

// Any shape carrying deriveWeaponDamage's addends.
interface OffHandDamageInput {
  damageModifier: number;
  abilityModifier?: number;
}

// Two-Weapon Fighting: the off-hand attack doesn't add the governing ability modifier to its damage unless negative (PHB'14 p. 195 / SRD 5.2 Light property; the fighting style restores it, so this takes no `edition`). `Math.max(0, …)` is that "unless negative" clause.
// `keepAbilityModifier` is the caller-resolved eligibility check (hasOffHandAbilityDamage: style taken AND bothWeaponsLight, #1640).
// Reduces `damageModifier` and `abilityModifier` by the same amount, keeping deriveWeaponDamage's `abilityModifier + meleeDamageBonus === damageModifier` invariant true (#1235).
// An absent `abilityModifier` means the decomposition is unknown — nothing is subtracted, keeping the full modifier.
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

// PHB'14 p. 195 / SRD 5.2 (Light property): BOTH weapons of the pair must be Light. The editions agree, so this takes no `edition` parameter (#1640).
// There are never more than two equipped weapons (MAIN_HAND/OFF_HAND only), so `every` over the full array is exactly the two-weapon check.
export function bothWeaponsLight(weapons: ReadonlyArray<{ light: boolean }>): boolean {
  return weapons.length >= 2 && weapons.every((w) => w.light);
}

// Default 1 (1 + STR mod, min 1); Tavern Brawler raises it to 4. Max wins across feats — never downgrade a damage die.
export function deriveUnarmedDamageDie(advancements: AdvancementEntry[]): number {
  let best = 1;
  for (const entry of advancements) {
    for (const imp of entry.improvements ?? []) {
      if (imp.target === "unarmedDamageDie") {
        best = Math.max(best, imp.amount);
      }
    }
  }
  return best;
}

// SRD 5.1 / PHB'14 p.78: 1d4 (L1-4), 1d6 (L5-10), 1d8 (L11-16), 1d10 (L17-20). SRD 5.2 / PHB'24 p.88: 1d6 (L1-4), 1d8 (L5-10), 1d10 (L11-16), 1d12 (L17-20).
// Level bands are identical across editions — only the die faces fork (#1499). Returns 0 below monk level 1 in both editions.
export function deriveMartialArtsDie(monkLevel: number, edition: RulesEdition): number {
  if (monkLevel < 1) return 0;
  switch (edition) {
    case "EDITION_2014":
      if (monkLevel >= 17) return 10;
      if (monkLevel >= 11) return 8;
      if (monkLevel >= 5) return 6;
      return 4;
    case "EDITION_2024":
      if (monkLevel >= 17) return 12;
      if (monkLevel >= 11) return 10;
      if (monkLevel >= 5) return 8;
      return 6;
    default: {
      const exhaustive: never = edition;
      throw new Error(`deriveMartialArtsDie: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Unarmed strikes are always proficient and default to STR (5e PHB). A Monk who is unarmored & unshielded uses max(Dex, Str) and the larger of the feat die and the Martial Arts die. Empowered Strikes (monk L6+) marks the strike magical.
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

// Per 5e PHB: improvised weapons deal 1d4 bludgeoning, use STR; not proficient unless Tavern Brawler grants a weaponProficiency for it.
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
