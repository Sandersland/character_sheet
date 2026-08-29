// #1534: mapStartingEquipmentPackage's three omission rules are the whole content of the wire-equivalence AC, pinned here since no seeded row exercises a null-null open pick.
import { describe, expect, it } from "vitest";

import { mapStartingEquipmentPackage, type StartingEquipmentPackageRow } from "../starting-equipment-package.js";

function packageRow(overrides: {
  groups: StartingEquipmentPackageRow["groups"];
  goldDiceCount?: number | null;
  goldDiceFaces?: number | null;
  goldMultiplier?: number | null;
}): StartingEquipmentPackageRow {
  return {
    id: "pkg-1",
    classId: "class-1",
    // #1565: backgroundId is nullable for background reuse; this fixture always represents a CLASS row.
    backgroundId: null,
    name: "Fixture Class",
    edition: "EDITION_2014",
    goldDiceCount: 5,
    goldDiceFaces: 4,
    goldMultiplier: 10,
    ...overrides,
  };
}

function optionRow(overrides: Partial<StartingEquipmentPackageRow["groups"][number]["options"][number]>) {
  return {
    id: "opt-1",
    groupId: "group-1",
    position: 0,
    label: "An option",
    gold: 0,
    items: [],
    openPicks: [],
    ...overrides,
  };
}

// #1564: every existing weapon open pick fixture defaults toolCategory: null, boundToToolChoice: false — the pre-#1564 shape.
function openPickRow(
  overrides: Partial<StartingEquipmentPackageRow["groups"][number]["options"][number]["openPicks"][number]>,
) {
  return {
    id: "pick-1",
    optionId: "opt-1",
    position: 0,
    label: "a pick",
    weaponClass: null,
    weaponRange: null,
    toolCategory: null,
    boundToToolChoice: false,
    quantity: 1,
    ...overrides,
  };
}

describe("mapStartingEquipmentPackage", () => {
  it("maps gold and a plain fixed-item bundle", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Armor",
          options: [
            optionRow({
              label: "Chain Mail",
              items: [{ id: "item-1", optionId: "opt-1", position: 0, catalogName: "Chain Mail", quantity: 1 }],
            }),
          ],
        },
      ],
    });

    expect(mapStartingEquipmentPackage(row)).toEqual({
      gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
      groups: [
        {
          label: "Armor",
          options: [{ label: "Chain Mail", items: [{ catalogName: "Chain Mail" }] }],
        },
      ],
    });
  });

  // [R7]: StartingEquipmentEditor.tsx reads pick.filter.weaponClass unguarded; no seeded row exercises this null-null case.
  it("maps an open pick with both weaponClass and weaponRange null to filter: {} (present, empty)", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Any gear",
          options: [
            optionRow({
              label: "Anything",
              openPicks: [openPickRow({ label: "any item" })],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks?.[0].filter).toEqual({});
    expect(mapped.groups[0].options[0].openPicks?.[0]).toHaveProperty("filter");
  });

  it("omits items when the option has none", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Weapon",
          options: [
            optionRow({
              label: "Two martial weapons",
              openPicks: [openPickRow({ label: "a martial weapon", weaponClass: "martial" })],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0]).not.toHaveProperty("items");
  });

  it("omits openPicks when the option has none", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Armor",
          options: [
            optionRow({
              label: "Chain Mail",
              items: [{ id: "item-1", optionId: "opt-1", position: 0, catalogName: "Chain Mail", quantity: 1 }],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0]).not.toHaveProperty("openPicks");
  });

  it("omits quantity on a fixed item when it is 1, but keeps it when > 1", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Ammo",
          options: [
            optionRow({
              label: "Arrows",
              items: [
                { id: "item-1", optionId: "opt-1", position: 0, catalogName: "Longbow", quantity: 1 },
                { id: "item-2", optionId: "opt-1", position: 1, catalogName: "Arrows", quantity: 20 },
              ],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].items).toEqual([
      { catalogName: "Longbow" },
      { catalogName: "Arrows", quantity: 20 },
    ]);
  });

  it("omits quantity on an open pick when it is 1, but keeps it when > 1", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Weapon",
          options: [
            optionRow({
              label: "Two of the same weapon",
              openPicks: [
                openPickRow({ label: "one martial weapon", weaponClass: "martial" }),
                openPickRow({ id: "pick-2", position: 1, label: "two martial weapons at once", weaponClass: "martial", quantity: 2 }),
              ],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks).toEqual([
      { label: "one martial weapon", filter: { weaponClass: "martial" } },
      { label: "two martial weapons at once", filter: { weaponClass: "martial" }, quantity: 2 },
    ]);
  });

  // #1564: option gold is omitted on the wire when 0, same discipline as quantity/items/openPicks.
  it("maps a nonzero option gold onto the wire's gold field", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "(a) chain mail or (b) leather armor and 20 gp",
          options: [
            optionRow({ label: "Chain Mail", items: [{ id: "item-1", optionId: "opt-1", position: 0, catalogName: "Chain Mail", quantity: 1 }] }),
            optionRow({ label: "20 GP", gold: 20 }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0]).not.toHaveProperty("gold");
    expect(mapped.groups[0].options[1].gold).toBe(20);
  });

  // #1564: PHB'24 has no roll-for-gold rule at all; NULL states that truthfully rather than 0/0/0 reading as "roll zero gold".
  it("maps jointly-null gold dice columns to gold: null on the wire", () => {
    const row = packageRow({
      goldDiceCount: null,
      goldDiceFaces: null,
      goldMultiplier: null,
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Choose an option",
          options: [optionRow({ label: "An option", gold: 10 })],
        },
      ],
    });

    expect(mapStartingEquipmentPackage(row).gold).toBeNull();
  });

  it("renames weaponRange to range on the wire", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Weapon",
          options: [
            optionRow({
              label: "Any simple melee weapon",
              openPicks: [openPickRow({ label: "any simple melee weapon", weaponClass: "simple", weaponRange: "melee" })],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks?.[0].filter).toEqual({ weaponClass: "simple", range: "melee" });
  });

  // #1564: the non-weapon filter axis — a "musical instrument of your choice" pick filters on toolCategory instead of weaponClass/range.
  it("maps toolCategory onto the wire's filter.toolCategory", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Musical instrument",
          options: [
            optionRow({
              label: "A musical instrument",
              openPicks: [openPickRow({ label: "musical instrument", toolCategory: "musicalInstrument" })],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks?.[0].filter).toEqual({ toolCategory: "musicalInstrument" });
  });

  // #1564: boundToToolChoice is omitted when false, present when true.
  it("omits boundToToolChoice when false, keeps it when true", () => {
    const row = packageRow({
      groups: [
        {
          id: "group-1",
          packageId: "pkg-1",
          position: 0,
          label: "Tool bound to proficiency",
          options: [
            optionRow({
              label: "Free weapon pick",
              openPicks: [openPickRow({ label: "any simple weapon", weaponClass: "simple" })],
            }),
            optionRow({
              label: "Bound tool pick",
              position: 1,
              openPicks: [openPickRow({ label: "the tool chosen above", boundToToolChoice: true })],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks?.[0]).not.toHaveProperty("boundToToolChoice");
    expect(mapped.groups[0].options[1].openPicks?.[0].boundToToolChoice).toBe(true);
  });
});
