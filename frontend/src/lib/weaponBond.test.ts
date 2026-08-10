import { describe, it, expect } from "vitest";

import { bondedWeaponCount, weaponBondEligible } from "@/lib/weaponBond";
import type { Character, InventoryItem } from "@/types/character";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    inventory: [],
    weaponBondCap: 2,
    availableActions: [],
    ...overrides,
  } as unknown as Character;
}

function makeWeapon(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Longsword",
    category: "weapon",
    quantity: 1,
    equipped: false,
    attuned: false,
    weaponBonded: false,
    requiresAttunement: false,
    equippable: true,
    allowedSlots: [],
    proficient: true,
    ...overrides,
  };
}

describe("weaponBondEligible", () => {
  it("is false when summonBondedWeapon is absent from availableActions", () => {
    expect(weaponBondEligible(makeCharacter({ availableActions: [] }))).toBe(false);
  });

  it("is true when the server-resolved availableActions include summonBondedWeapon", () => {
    const character = makeCharacter({
      availableActions: [{ key: "summonBondedWeapon", name: "Summon Bonded Weapon", cost: "bonusAction", enabled: true }],
    });
    expect(weaponBondEligible(character)).toBe(true);
  });

  it("is false when availableActions itself is absent (never re-derives eligibility)", () => {
    expect(weaponBondEligible(makeCharacter({ availableActions: undefined }))).toBe(false);
  });
});

describe("bondedWeaponCount", () => {
  it("counts only weaponBonded:true rows", () => {
    const character = makeCharacter({
      inventory: [
        makeWeapon({ id: "a", weaponBonded: true }),
        makeWeapon({ id: "b", weaponBonded: false }),
        makeWeapon({ id: "c", weaponBonded: true }),
      ],
    });
    expect(bondedWeaponCount(character)).toBe(2);
  });
});
