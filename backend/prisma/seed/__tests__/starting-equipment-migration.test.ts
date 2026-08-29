// vitest.global-setup.ts clones a template DB that already ran `prisma db seed` — every row asserted against below is the real seeded catalog, not a fixture.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { STARTING_EQUIPMENT_PACKAGES, BACKGROUND_STARTING_EQUIPMENT_PACKAGES } from "../starting-equipment.js";
import { assertEveryClassEditionHasPackage, seedStartingEquipment } from "../seed-starting-equipment.js";

describe("StartingEquipmentPackage migration — row count (#1533, #1565)", () => {
  it("the seeded table holds exactly one row per (class + background) package literal (32)", async () => {
    const actual = await prisma.startingEquipmentPackage.count();
    expect(actual).toBe(STARTING_EQUIPMENT_PACKAGES.length + BACKGROUND_STARTING_EQUIPMENT_PACKAGES.length);
    expect(actual).toBe(32);
  });

  it("every class has both an EDITION_2014 and an EDITION_2024 package with >= 1 group", async () => {
    const packages = await prisma.startingEquipmentPackage.findMany({
      where: { classId: { not: null } },
      select: { name: true, edition: true, _count: { select: { groups: true } } },
    });
    expect(packages.length).toBe(STARTING_EQUIPMENT_PACKAGES.length);
    for (const row of packages) {
      expect(row._count.groups, `${row.name}/${row.edition}`).toBeGreaterThan(0);
    }
  });

  // 8, not the 14 a full 7-background x 2-edition grid would suggest — only Acolyte exists in both editions.
  it("exactly 8 background packages exist, each with >= 1 group", async () => {
    const packages = await prisma.startingEquipmentPackage.findMany({
      where: { backgroundId: { not: null } },
      select: { name: true, edition: true, _count: { select: { groups: true } } },
    });
    expect(packages.length).toBe(8);
    expect(packages.length).toBe(BACKGROUND_STARTING_EQUIPMENT_PACKAGES.length);
    for (const row of packages) {
      expect(row._count.groups, `${row.name}/${row.edition}`).toBeGreaterThan(0);
    }
  });
});

// Values verified against the PHB'24 stat blocks directly, not a reference site.
describe("Charlatan/Noble 2024 background packages (#1570)", () => {
  async function optionsFor(backgroundName: string) {
    const pkg = await prisma.startingEquipmentPackage.findFirst({
      where: { background: { name: backgroundName }, edition: "EDITION_2024" },
      include: {
        groups: {
          orderBy: { position: "asc" },
          include: {
            options: {
              orderBy: { position: "asc" },
              include: {
                items: { orderBy: { position: "asc" } },
                openPicks: { orderBy: { position: "asc" } },
              },
            },
          },
        },
      },
    });
    return pkg;
  }

  it("Charlatan: (A) Forgery Kit, Costume, Fine Clothes, 15 GP; or (B) 50 GP", async () => {
    const pkg = await optionsFor("Charlatan");
    expect(pkg).not.toBeNull();
    // No roll-for-gold alternative — same as every other background package.
    expect(pkg!.goldDiceCount).toBeNull();
    expect(pkg!.groups).toHaveLength(1);

    const [a, b] = pkg!.groups[0].options;
    expect(a.items.map((i) => i.catalogName)).toEqual(["Forgery Kit", "Costume Clothes", "Fine Clothes"]);
    expect(a.gold).toBe(15);
    expect(a.openPicks).toHaveLength(0);
    expect(b.items).toHaveLength(0);
    expect(b.gold).toBe(50);
  });

  it("Noble: (A) Gaming Set (same as above), Fine Clothes, Perfume, 29 GP; or (B) 50 GP", async () => {
    const pkg = await optionsFor("Noble");
    expect(pkg).not.toBeNull();
    expect(pkg!.goldDiceCount).toBeNull();

    const [a, b] = pkg!.groups[0].options;
    expect(a.items.map((i) => i.catalogName)).toEqual(["Fine Clothes", "Perfume Vial"]);
    expect(a.gold).toBe(29);
    // "same as above" binds to the gaming-set proficiency the background itself grants — same mechanism as Soldier's package.
    expect(a.openPicks).toHaveLength(1);
    expect(a.openPicks[0].toolCategory).toBe("gamingSet");
    expect(a.openPicks[0].boundToToolChoice).toBe(true);
    expect(b.gold).toBe(50);
  });

  // SRD 5.2 lists Forgery Kit (15 GP, 5 lb) in its tools table — citable even though the background isn't.
  it("seeds the Forgery Kit item the Charlatan package references", async () => {
    const item = await prisma.item.findFirst({ where: { name: "Forgery Kit" } });
    expect(item).not.toBeNull();
    expect(item!.toolCategory).toBe("other");
  });
});

describe("StartingEquipmentPackage migration — seedStartingEquipment is idempotent (#1533 [R7])", () => {
  it("running it again against an already-seeded table leaves every count unchanged and raises no P2002", async () => {
    const before = {
      packages: await prisma.startingEquipmentPackage.count(),
      groups: await prisma.startingEquipmentGroup.count(),
      options: await prisma.startingEquipmentOption.count(),
      items: await prisma.startingEquipmentItem.count(),
      openPicks: await prisma.startingEquipmentOpenPick.count(),
    };

    await expect(seedStartingEquipment(prisma)).resolves.toBeUndefined();

    expect({
      packages: await prisma.startingEquipmentPackage.count(),
      groups: await prisma.startingEquipmentGroup.count(),
      options: await prisma.startingEquipmentOption.count(),
      items: await prisma.startingEquipmentItem.count(),
      openPicks: await prisma.startingEquipmentOpenPick.count(),
    }).toEqual(before);
  });

  it("running it twice in a row (fresh call each time) leaves startingEquipmentGroup.count() unchanged", async () => {
    const before = await prisma.startingEquipmentGroup.count();
    await seedStartingEquipment(prisma);
    await seedStartingEquipment(prisma);
    expect(await prisma.startingEquipmentGroup.count()).toBe(before);
  });
});

describe("assertEveryClassEditionHasPackage — guard (#1533 [R5])", () => {
  it("returns a non-vacuous summary against the real seeded table", async () => {
    const summary = await assertEveryClassEditionHasPackage(prisma);
    // rowsCounted >= pairsChecked since every pair has >= 1 group (12 classes x 2 editions = 24 pairs).
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(24);
    expect(summary.rowsCounted).toBeGreaterThanOrEqual(summary.pairsChecked);
  });

  it("deleting one class's 2024 package rows makes the guard throw naming that class and edition", async () => {
    const monk2024 = await prisma.startingEquipmentPackage.findFirstOrThrow({
      where: { class: { name: "Monk" }, edition: "EDITION_2024" },
    });
    await prisma.startingEquipmentPackage.delete({ where: { id: monk2024.id } });

    await expect(assertEveryClassEditionHasPackage(prisma)).rejects.toThrow(/Monk \/ EDITION_2024/);

    await seedStartingEquipment(prisma);
    await expect(assertEveryClassEditionHasPackage(prisma)).resolves.toBeDefined();
  });
});
