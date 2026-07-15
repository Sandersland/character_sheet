import { describe, it, expect } from "vitest";

import {
  attunementSummary,
  buildLoadoutGroups,
  type FilledLoadoutRow,
  type LoadoutRow,
} from "@/lib/loadout";
import type { Character, InventoryItem } from "@/types/character";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i",
    name: "Item",
    category: "gear",
    quantity: 1,
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    ...overrides,
  };
}

const weapon = (twoHanded: boolean, o: Partial<InventoryItem> = {}) =>
  item({
    category: "weapon",
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 0,
      damageType: "slashing",
      finesse: false,
      light: false,
      heavy: false,
      twoHanded,
      reach: false,
      thrown: false,
      ammunition: false,
    },
    ...o,
  });

const versatileWeapon = (grip: "one-handed" | "versatile-two-handed", faces: number, o: Partial<InventoryItem> = {}) =>
  weapon(false, {
    name: "Longsword",
    weapon: {
      ...weapon(false).weapon!,
      weaponClass: "martial",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      damage: { damageDiceCount: 1, damageDiceFaces: faces, damageModifier: 0, abilityModifier: 0, damageType: "slashing", grip },
    },
    ...o,
  });

interface Profs {
  weapon?: { name: string }[];
  armor?: { category: string }[];
}

function makeCharacter(inventory: InventoryItem[], profs: Profs = {}): Character {
  return {
    id: "char-1",
    name: "Aria",
    armorClass: 15,
    inventory,
    weaponProficiencies: profs.weapon ?? [],
    armorProficiencies: profs.armor ?? [],
  } as unknown as Character;
}

function rowsByKind(rows: LoadoutRow[], kind: LoadoutRow["kind"]) {
  return rows.filter((r) => r.kind === kind);
}

describe("buildLoadoutGroups", () => {
  it("returns the three groups in order with renamed labels", () => {
    const groups = buildLoadoutGroups(makeCharacter([]));
    expect(groups.map((g) => g.key)).toEqual(["hands", "armor", "adornment"]);
    expect(groups.map((g) => g.label)).toEqual(["Weapons", "Armor", "Accessories"]);
  });

  it("renders open slots as empty rows", () => {
    const groups = buildLoadoutGroups(makeCharacter([]));
    const hands = groups.find((g) => g.key === "hands")!;
    expect(hands.rows).toHaveLength(2);
    expect(hands.rows.every((r) => r.kind === "empty")).toBe(true);
    expect(hands.rows.map((r) => r.slot)).toEqual(["MAIN_HAND", "OFF_HAND"]);
  });

  it("produces a filled row for an equipped item", () => {
    const groups = buildLoadoutGroups(
      makeCharacter([weapon(false, { id: "sword", name: "Longsword", equippedSlot: "MAIN_HAND" })]),
    );
    const hands = groups.find((g) => g.key === "hands")!;
    const main = hands.rows.find((r) => r.slot === "MAIN_HAND")!;
    expect(main.kind).toBe("filled");
    expect((main as FilledLoadoutRow).item.name).toBe("Longsword");
  });

  it("expands RING to two rows: filled ring plus an empty one", () => {
    const groups = buildLoadoutGroups(
      makeCharacter([item({ id: "band", name: "Signet Band", slot: "RING", equippedSlot: "RING" })]),
    );
    const adorn = groups.find((g) => g.key === "adornment")!;
    const rings = adorn.rows.filter((r) => r.slot === "RING");
    expect(rings).toHaveLength(2);
    expect(rowsByKind(rings, "filled")).toHaveLength(1);
    expect(rowsByKind(rings, "empty")).toHaveLength(1);
    expect(rings.map((r) => r.label)).toEqual(["Ring 1", "Ring 2"]);
  });

  it("renders two filled RING rows when both are worn", () => {
    const groups = buildLoadoutGroups(
      makeCharacter([
        item({ id: "a", name: "Ring A", slot: "RING", equippedSlot: "RING" }),
        item({ id: "b", name: "Ring B", slot: "RING", equippedSlot: "RING" }),
      ]),
    );
    const rings = groups.find((g) => g.key === "adornment")!.rows.filter((r) => r.slot === "RING");
    expect(rowsByKind(rings, "filled")).toHaveLength(2);
  });

  it("locks the off-hand when a two-handed weapon is main-hand", () => {
    const groups = buildLoadoutGroups(
      makeCharacter([weapon(true, { id: "gs", name: "Greatsword", equippedSlot: "MAIN_HAND" })]),
    );
    const hands = groups.find((g) => g.key === "hands")!;
    const off = hands.rows.find((r) => r.slot === "OFF_HAND")!;
    expect(off.kind).toBe("locked");
    expect(off).toMatchObject({ lockedByName: "Greatsword" });
  });

  it("propagates notProficient from isProficientWithItem", () => {
    const martial = weapon(false, {
      id: "axe",
      name: "Greataxe",
      equippedSlot: "MAIN_HAND",
      weapon: { ...weapon(false).weapon!, weaponClass: "martial" },
    });
    const warns = buildLoadoutGroups(makeCharacter([martial]))
      .flatMap((g) => g.rows)
      .find((r) => r.slot === "MAIN_HAND") as FilledLoadoutRow;
    expect(warns.notProficient).toBe(true);

    const ok = buildLoadoutGroups(makeCharacter([martial], { weapon: [{ name: "Martial Weapons" }] }))
      .flatMap((g) => g.rows)
      .find((r) => r.slot === "MAIN_HAND") as FilledLoadoutRow;
    expect(ok.notProficient).toBe(false);
  });

  it("propagates the versatile grip only to the main-hand row", () => {
    const groups = buildLoadoutGroups(
      makeCharacter(
        [versatileWeapon("versatile-two-handed", 10, { id: "ls", equippedSlot: "MAIN_HAND" })],
        { weapon: [{ name: "Martial Weapons" }] },
      ),
    );
    const main = groups.flatMap((g) => g.rows).find((r) => r.slot === "MAIN_HAND") as FilledLoadoutRow;
    expect(main.grip?.short).toBe("1d10");
  });
});

describe("attunementSummary", () => {
  it("reports zero attuned as below cap", () => {
    expect(attunementSummary([])).toEqual({ count: 0, cap: 3, atCap: false });
  });

  it("reports two attuned as below cap", () => {
    const inv = [item({ id: "a", attuned: true }), item({ id: "b", attuned: true })];
    expect(attunementSummary(inv)).toEqual({ count: 2, cap: 3, atCap: false });
  });

  it("reports three attuned as at cap", () => {
    const inv = [
      item({ id: "a", attuned: true }),
      item({ id: "b", attuned: true }),
      item({ id: "c", attuned: true }),
    ];
    expect(attunementSummary(inv)).toEqual({ count: 3, cap: 3, atCap: true });
  });
});
