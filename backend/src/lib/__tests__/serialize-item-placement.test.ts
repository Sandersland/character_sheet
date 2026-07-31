import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

// The served placement/proficiency flags (#1433). The snapshot suite cannot
// cover these: its fixtures' CharacterClass rows are suite-local with empty
// armorProficiencies/weaponProficiencies columns (#1529) and it carries no
// two-handed weapon, so `proficient: true` and `offHandLocked: true` are both
// unreachable there.

const OWNER_ID = "owner-serialize-placement";

const BASE_CHAR = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const LONGSWORD = {
  create: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", weaponClass: "martial", weaponRange: "melee" },
} as const;

let characterIds: string[] = [];

// #1529: armor/weapon proficiency grants resolve via the class FK relation
// now, not a name lookup — every fixture below must link classId to the REAL
// seeded catalog row for its className, or the class half of "proficient"
// silently becomes the homebrew fallback (nothing granted).
async function createCharacter(data: {
  className: string;
  raceName?: string;
  items?: Prisma.InventoryItemCreateWithoutCharacterInput[];
}) {
  const classId = (await prisma.characterClass.findFirstOrThrow({ where: { name: data.className }, select: { id: true } })).id;
  const character = await prisma.character.create({
    data: {
      ...BASE_CHAR,
      name: `Placement ${data.className}`,
      ownerId: OWNER_ID,
      spellcasting: Prisma.JsonNull,
      classEntries: { create: { name: data.className, classId, level: 1, position: 0 } },
      ...(data.raceName ? { raceSelection: { create: { name: data.raceName } } } : {}),
      ...(data.items ? { inventoryItems: { create: data.items } } : {}),
    },
  });
  characterIds.push(character.id);
  return character.id;
}

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

function rowNamed(view: Awaited<ReturnType<typeof serialize>>, name: string) {
  const item = view.inventory.find((i) => i.name === name);
  if (!item) throw new Error(`no inventory row named ${name}`);
  return item;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  characterIds = [];
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
});

describe("serialized allowedSlots + equippable (#1433)", () => {
  let view: Awaited<ReturnType<typeof serialize>>;

  beforeEach(async () => {
    const id = await createCharacter({
      className: "Fighter",
      items: [
        { name: "One-Handed Sword", category: "weapon", quantity: 1, position: 0, weaponDetail: LONGSWORD },
        {
          name: "Greatsword",
          category: "weapon",
          quantity: 1,
          position: 1,
          weaponDetail: { create: { damageDiceCount: 2, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing", twoHanded: true, weaponClass: "martial", weaponRange: "melee" } },
        },
        {
          name: "Shield",
          category: "armor",
          quantity: 1,
          position: 2,
          armorDetail: { create: { armorCategory: "shield", baseArmorClass: 2, dexModifierApplies: false } },
        },
        {
          name: "Chain Shirt",
          category: "armor",
          quantity: 1,
          position: 3,
          armorDetail: { create: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true, dexModifierMax: 2 } },
        },
        { name: "Circlet", category: "gear", quantity: 1, position: 4, slot: "HEAD" },
        { name: "Rope", category: "gear", quantity: 1, position: 5 },
        { name: "Potion", category: "consumable", quantity: 1, position: 6 },
      ],
    });
    view = await serialize(id);
  });

  it("derives allowedSlots per category from the row's own detail snapshot", () => {
    expect(rowNamed(view, "One-Handed Sword").allowedSlots).toEqual(["MAIN_HAND", "OFF_HAND"]);
    expect(rowNamed(view, "Greatsword").allowedSlots).toEqual(["MAIN_HAND"]);
    expect(rowNamed(view, "Shield").allowedSlots).toEqual(["OFF_HAND"]);
    expect(rowNamed(view, "Chain Shirt").allowedSlots).toEqual(["BODY"]);
    expect(rowNamed(view, "Circlet").allowedSlots).toEqual(["HEAD"]);
    expect(rowNamed(view, "Rope").allowedSlots).toEqual([]);
    expect(rowNamed(view, "Potion").allowedSlots).toEqual([]);
  });

  // The assertion that fails if the two flags are collapsed into one: worn gear
  // is placeable but NOT equippable, which is what keeps the inventory row's
  // equip toggle off a circlet while the loadout HEAD picker still offers it.
  it("keeps equippable a category rule, not allowedSlots.length > 0", () => {
    const circlet = rowNamed(view, "Circlet");
    expect(circlet.equippable).toBe(false);
    expect(circlet.allowedSlots).toEqual(["HEAD"]);
    expect(rowNamed(view, "One-Handed Sword").equippable).toBe(true);
    expect(rowNamed(view, "Chain Shirt").equippable).toBe(true);
    expect(rowNamed(view, "Shield").equippable).toBe(true);
    expect(rowNamed(view, "Rope").equippable).toBe(false);
    expect(rowNamed(view, "Potion").equippable).toBe(false);
  });
});

describe("serialized offHandLocked (#1433)", () => {
  it("is true while a two-handed weapon holds the main hand", async () => {
    const id = await createCharacter({
      className: "Fighter",
      items: [
        {
          name: "Greatsword",
          category: "weapon",
          quantity: 1,
          position: 0,
          equippedSlot: "MAIN_HAND",
          weaponDetail: { create: { damageDiceCount: 2, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing", twoHanded: true, weaponClass: "martial", weaponRange: "melee" } },
        },
      ],
    });
    expect((await serialize(id)).offHandLocked).toBe(true);
  });

  it("is false for a one-handed weapon in the main hand", async () => {
    const id = await createCharacter({
      className: "Fighter",
      items: [{ name: "Longsword", category: "weapon", quantity: 1, position: 0, equippedSlot: "MAIN_HAND", weaponDetail: LONGSWORD }],
    });
    expect((await serialize(id)).offHandLocked).toBe(false);
  });

  // Slot-scoped, not inventory-scoped — a greatsword in the bag locks nothing.
  it("is false while the two-handed weapon is unequipped", async () => {
    const id = await createCharacter({
      className: "Fighter",
      items: [
        {
          name: "Greatsword",
          category: "weapon",
          quantity: 1,
          position: 0,
          weaponDetail: { create: { damageDiceCount: 2, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing", twoHanded: true, weaponClass: "martial", weaponRange: "melee" } },
        },
      ],
    });
    expect((await serialize(id)).offHandLocked).toBe(false);
  });
});

describe("serialized proficient (#1433)", () => {
  const longswordItem: Prisma.InventoryItemCreateWithoutCharacterInput = {
    name: "Longsword",
    category: "weapon",
    quantity: 1,
    position: 0,
    equippedSlot: "MAIN_HAND",
    weaponDetail: LONGSWORD,
  };

  it("warns for a class whose grants miss the weapon", async () => {
    const id = await createCharacter({ className: "Wizard", items: [longswordItem] });
    expect(rowNamed(await serialize(id), "Longsword").proficient).toBe(false);
  });

  it("is true when a class grant covers the weapon category", async () => {
    const id = await createCharacter({ className: "Fighter", items: [longswordItem] });
    expect(rowNamed(await serialize(id), "Longsword").proficient).toBe(true);
  });

  it("is true via a race grant (RACE_PROFICIENCY_GRANTS)", async () => {
    const id = await createCharacter({
      className: "Wizard",
      raceName: "Hill Dwarf",
      items: [
        {
          name: "Battleaxe",
          category: "weapon",
          quantity: 1,
          position: 0,
          equippedSlot: "MAIN_HAND",
          weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", weaponClass: "martial", weaponRange: "melee" } },
        },
      ],
    });
    expect(rowNamed(await serialize(id), "Battleaxe").proficient).toBe(true);
  });

  it("matches the armor branch by category", async () => {
    const id = await createCharacter({
      className: "Wizard",
      items: [
        {
          name: "Chain Shirt",
          category: "armor",
          quantity: 1,
          position: 0,
          equippedSlot: "BODY",
          armorDetail: { create: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true } },
        },
      ],
    });
    expect(rowNamed(await serialize(id), "Chain Shirt").proficient).toBe(false);

    const fighterId = await createCharacter({
      className: "Fighter",
      items: [
        {
          name: "Chain Shirt",
          category: "armor",
          quantity: 1,
          position: 0,
          equippedSlot: "BODY",
          armorDetail: { create: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true } },
        },
      ],
    });
    expect(rowNamed(await serialize(fighterId), "Chain Shirt").proficient).toBe(true);
  });

  // The flag must read the ITEM-MERGED weapon grants — the same array the wire
  // `weaponProficiencies` field renders — not InventoryItemContext.weaponGrants,
  // which omits item grants so deriveWeaponAttackComponents keeps its (deliberate)
  // un-merged list. Reading the un-merged list would re-warn on a weapon the
  // sheet simultaneously lists as proficient.
  it("is true when an active item grants the weapon category", async () => {
    const id = await createCharacter({
      className: "Wizard",
      items: [
        longswordItem,
        {
          name: "Gauntlets of Training",
          category: "gear",
          quantity: 1,
          position: 1,
          slot: "HANDS",
          equippedSlot: "HANDS",
          capabilities: {
            create: [{ kind: "grant", grantType: "proficiency", grantValueKind: "weapon", grantValue: "Martial Weapons" }],
          },
        },
      ],
    });
    const view = await serialize(id);
    expect(view.weaponProficiencies).toContainEqual({ name: "Martial Weapons", source: "item" });
    expect(rowNamed(view, "Longsword").proficient).toBe(true);
    // The attack-bonus path deliberately keeps the un-merged list, so the item
    // grant does NOT add the proficiency bonus — the asymmetry is pre-existing.
    expect(rowNamed(view, "Longsword").weapon?.attackBonusComponents.proficiencyBonus).toBe(0);
  });

  it("never warns on an item that carries no proficiency requirement", async () => {
    const id = await createCharacter({
      className: "Wizard",
      items: [
        { name: "Rope", category: "gear", quantity: 1, position: 0 },
        { name: "Potion", category: "consumable", quantity: 1, position: 1 },
        { name: "Odd Blade", category: "weapon", quantity: 1, position: 2, weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 0, damageType: "slashing" } } },
      ],
    });
    const view = await serialize(id);
    expect(rowNamed(view, "Rope").proficient).toBe(true);
    expect(rowNamed(view, "Potion").proficient).toBe(true);
    expect(rowNamed(view, "Odd Blade").proficient).toBe(true);
  });
});
