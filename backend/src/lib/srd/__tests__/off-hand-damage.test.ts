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

const lightPair = [{ light: true }, { light: true }];
const nonLightPair = [{ light: false }, { light: false }];
const mixedPair = [{ light: true }, { light: false }];

describe("deriveOffHandDamage (PHB'14 p. 195 / SRD 5.2 Light property)", () => {
  it("drops the governing ability modifier without the Two-Weapon Fighting style", () => {
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
    expect(damage.damageModifier).toBe(5);

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

describe("hasOffHandAbilityDamage (PHB'14 p. 195 + p. 72 / SRD 5.2 Light property — #1640)", () => {
  it("is false with no advancement, regardless of the weapons", () => {
    expect(hasOffHandAbilityDamage([], lightPair)).toBe(false);
    expect(hasOffHandAbilityDamage([], nonLightPair)).toBe(false);
  });

  it("ignores other fighting-style improvements", () => {
    const archery = [
      { id: "fs1", slot: "fightingStyle", improvements: [{ target: "rangedAttackRoll", amount: 2 }] },
    ] as unknown as AdvancementEntry[];
    expect(hasOffHandAbilityDamage(archery, lightPair)).toBe(false);
  });

  it("tolerates an advancement with no improvements array", () => {
    expect(
      hasOffHandAbilityDamage([{ id: "asi1", slot: "asi" }] as unknown as AdvancementEntry[], lightPair),
    ).toBe(false);
  });

  it("is true with the style AND a light weapon in each hand", () => {
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle, lightPair)).toBe(true);
  });

  it("is false with the style but a NON-light pair — the style does not waive the Light requirement", () => {
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle, nonLightPair)).toBe(false);
  });

  it("is false with the style when only one of the two weapons is light", () => {
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle, mixedPair)).toBe(false);
  });

  it("is false with the style and fewer than two weapons", () => {
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle, [{ light: true }])).toBe(false);
    expect(hasOffHandAbilityDamage(twoWeaponFightingStyle, [])).toBe(false);
  });
});
