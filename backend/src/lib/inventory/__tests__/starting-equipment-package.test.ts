// Pure mapper unit tests (#1534) — no database. mapStartingEquipmentPackage's
// three omission rules are the whole content of the wire-equivalence AC, so
// each is pinned directly here rather than relying on the route fixture alone
// to exercise every branch (no seeded row exercises a null-null open pick yet).
import { describe, expect, it } from "vitest";

import { mapStartingEquipmentPackage, type StartingEquipmentPackageRow } from "../starting-equipment-package.js";

// Builds a minimally-valid StartingEquipmentPackageRow — every field the type
// requires is present (even ones the mapper ignores, e.g. id/classId/position)
// so this compiles against the real Prisma payload shape, not a loosened stand-in.
function packageRow(overrides: {
  groups: StartingEquipmentPackageRow["groups"];
  goldDiceCount?: number | null;
  goldDiceFaces?: number | null;
  goldMultiplier?: number | null;
}): StartingEquipmentPackageRow {
  return {
    id: "pkg-1",
    classId: "class-1",
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

  // [R7] — the load-bearing rule. StartingEquipmentEditor.tsx reads
  // pick.filter.weaponClass unguarded; every seeded row today has a non-null
  // weaponClass, so this is the one case no seeded row exercises.
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
              openPicks: [
                {
                  id: "pick-1",
                  optionId: "opt-1",
                  position: 0,
                  label: "any item",
                  weaponClass: null,
                  weaponRange: null,
                  quantity: 1,
                },
              ],
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
              openPicks: [
                {
                  id: "pick-1",
                  optionId: "opt-1",
                  position: 0,
                  label: "a martial weapon",
                  weaponClass: "martial",
                  weaponRange: null,
                  quantity: 1,
                },
              ],
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
                {
                  id: "pick-1",
                  optionId: "opt-1",
                  position: 0,
                  label: "one martial weapon",
                  weaponClass: "martial",
                  weaponRange: null,
                  quantity: 1,
                },
                {
                  id: "pick-2",
                  optionId: "opt-1",
                  position: 1,
                  label: "two martial weapons at once",
                  weaponClass: "martial",
                  weaponRange: null,
                  quantity: 2,
                },
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

  // #1564: every PHB'24 option carries GP (4-28 for a non-final option, 50-155
  // for the flat final option); omitted on the wire when 0 (every 2014 option,
  // and the PHB'24 non-gold options), same discipline as quantity/items/openPicks.
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

  // #1564 commit 3: PHB'24 has no roll-for-gold rule at all — NULL states
  // that truthfully (0/0/0 would read as "roll zero gold", the same class of
  // lie as encoding a flat 155 GP as {1,1,155}).
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
              openPicks: [
                {
                  id: "pick-1",
                  optionId: "opt-1",
                  position: 0,
                  label: "any simple melee weapon",
                  weaponClass: "simple",
                  weaponRange: "melee",
                  quantity: 1,
                },
              ],
            }),
          ],
        },
      ],
    });

    const mapped = mapStartingEquipmentPackage(row);
    expect(mapped.groups[0].options[0].openPicks?.[0].filter).toEqual({ weaponClass: "simple", range: "melee" });
  });
});
