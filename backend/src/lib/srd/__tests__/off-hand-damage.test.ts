import { describe, it, expect } from "vitest";

import { deriveOffHandDamage, deriveWeaponDamage, hasOffHandAbilityDamage } from "@/lib/srd/srd.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";

const shortsword = {
  name: "Shortsword",
  finesse: true,
  weaponRange: "melee",
  damageDiceCount: 1,
  damageDiceFaces: 6,
  damageType: "piercing",
  twoHanded: false,
};

const twoWeaponFightingStyle = [
  { id: "fs1", slot: "fightingStyle", featName: "Two-Weapon Fighting", improvements: [{ target: "offhandAbilityDamage", amount: 1 }] },
] as unknown as AdvancementEntry[];

describe("deriveOffHandDamage (PHB'14 p. 195 / SRD 5.2 Light property)", () => {
  it("drops the governing ability modifier without the Two-Weapon Fighting style", () => {
    // STR 16 → +3, folded into damageModifier by deriveWeaponDamage.
    const damage = deriveWeaponDamage(shortsword, true, { strength: 16, dexterity: 10 });
    expect(damage.damageModifier).toBe(3);

    const offHand = deriveOffHandDamage(damage, false);
    expect(offHand.damageModifier).toBe(0);
    expect(offHand.abilityModifier).toBe(0);
  });

  it("keeps the ability modifier with the Two-Weapon Fighting style", () => {
    const damage = deriveWeaponDamage(shortsword, true, { strength: 16, dexterity: 10 });
    expect(deriveOffHandDamage(damage, true)).toEqual(damage);
  });

  it("keeps a negative ability modifier — only a positive one is dropped", () => {
    // STR 8 → −1. RAW: "unless that modifier is negative".
    const damage = deriveWeaponDamage(shortsword, true, { strength: 8, dexterity: 8 });
    expect(damage.abilityModifier).toBe(-1);

    const offHand = deriveOffHandDamage(damage, false);
    expect(offHand.damageModifier).toBe(-1);
    expect(offHand.abilityModifier).toBe(-1);
  });

  it("keeps the full modifier when the decomposition is unknown (pre-#732 row)", () => {
    const legacy = { damageModifier: 3, meleeDamageBonus: 0 };
    expect(deriveOffHandDamage(legacy, false)).toEqual(legacy);
  });

  it("drops only the ability component, so a Rage melee-damage buff survives", () => {
    const damage = deriveWeaponDamage(shortsword, true, { strength: 16, dexterity: 10 }, 2);
    expect(damage.damageModifier).toBe(5); // STR +3 + Rage +2

    const offHand = deriveOffHandDamage(damage, false);
    expect(offHand.damageModifier).toBe(2);
    expect(offHand.meleeDamageBonus).toBe(2);
  });

  it("preserves deriveWeaponDamage's abilityModifier + meleeDamageBonus === damageModifier invariant", () => {
    for (const strength of [6, 8, 10, 14, 16, 20]) {
      for (const rage of [0, 2, 3]) {
        for (const style of [false, true]) {
          const offHand = deriveOffHandDamage(
            deriveWeaponDamage(shortsword, true, { strength, dexterity: 10 }, rage),
            style,
          );
          expect(offHand.abilityModifier + offHand.meleeDamageBonus).toBe(offHand.damageModifier);
        }
      }
    }
  });

  it("leaves the dice, damage type and grip untouched", () => {
    const damage = deriveWeaponDamage(shortsword, true, { strength: 16, dexterity: 10 });
    const offHand = deriveOffHandDamage(damage, false);
    expect(offHand.damageDiceCount).toBe(1);
    expect(offHand.damageDiceFaces).toBe(6);
    expect(offHand.damageType).toBe("piercing");
    expect(offHand.grip).toBe("one-handed");
  });

  it("does not mutate its input", () => {
    const damage = deriveWeaponDamage(shortsword, true, { strength: 16, dexterity: 10 });
    deriveOffHandDamage(damage, false);
    expect(damage.damageModifier).toBe(3);
    expect(damage.abilityModifier).toBe(3);
  });
});

describe("hasOffHandAbilityDamage", () => {
  it("is true only when an advancement carries the offhandAbilityDamage marker", () => {
    expect(hasOffHandAbilityDamage([])).toBe(false);
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle)).toBe(true);
  });

  it("ignores other fighting-style improvements", () => {
    const archery = [
      { id: "fs1", slot: "fightingStyle", improvements: [{ target: "rangedAttackRoll", amount: 2 }] },
    ] as unknown as AdvancementEntry[];
    expect(hasOffHandAbilityDamage(archery)).toBe(false);
  });

  it("tolerates an advancement with no improvements array", () => {
    expect(hasOffHandAbilityDamage([{ id: "asi1", slot: "asi" }] as unknown as AdvancementEntry[])).toBe(false);
  });
});
