// DB-backed migration-correctness suite for #1519/#1533: StartingEquipmentPackage
// (+Group/Option/Item/OpenPick) is a seeded home for the twelve classes'
// starting-equipment packages, still served ONLY from STARTING_EQUIPMENT (no
// reader yet — #1534). Modelled on class-feature-migration.test.ts:
// seed-starting-equipment.ts exports seedStartingEquipment(prisma) precisely
// so this file can call it in-process (seed.ts's OWN families can't be
// re-run this way — main() self-invokes at module load and exports nothing).
//
// The template DB vitest.global-setup.ts clones from already ran
// `prisma db seed` once, so every row asserted against below is the REAL
// seeded catalog, not a fixture.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { STARTING_EQUIPMENT_PACKAGES, BACKGROUND_STARTING_EQUIPMENT_PACKAGES } from "../starting-equipment.js";
import { assertEveryClassEditionHasPackage, seedStartingEquipment } from "../seed-starting-equipment.js";

describe("StartingEquipmentPackage migration — row count (#1533, #1565)", () => {
  it("the seeded table holds exactly one row per (class + background) package literal (29)", async () => {
    const actual = await prisma.startingEquipmentPackage.count();
    expect(actual).toBe(STARTING_EQUIPMENT_PACKAGES.length + BACKGROUND_STARTING_EQUIPMENT_PACKAGES.length);
    expect(actual).toBe(29);
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

  // #1565: exactly five background packages exist (Acolyte both editions;
  // Criminal/Sage/Soldier 2024 only) — never the fourteen a full 7-background
  // x 2-edition grid would suggest (Charlatan/Folk Hero/Noble get none, on
  // purpose — see starting-equipment.ts's background-section header).
  it("exactly 5 background packages exist, each with >= 1 group", async () => {
    const packages = await prisma.startingEquipmentPackage.findMany({
      where: { backgroundId: { not: null } },
      select: { name: true, edition: true, _count: { select: { groups: true } } },
    });
    expect(packages.length).toBe(5);
    expect(packages.length).toBe(BACKGROUND_STARTING_EQUIPMENT_PACKAGES.length);
    for (const row of packages) {
      expect(row._count.groups, `${row.name}/${row.edition}`).toBeGreaterThan(0);
    }
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
    // 12 classes x 2 editions = 24 pairs; rowsCounted sums each pair's group
    // count, so it must be >= pairsChecked (every pair has >= 1 group).
    expect(summary.pairsChecked).toBeGreaterThanOrEqual(24);
    expect(summary.rowsCounted).toBeGreaterThanOrEqual(summary.pairsChecked);
  });

  // Mutation proof (#1533's AC): delete one class's 2024 package rows,
  // confirm the guard throws naming BOTH the class and the edition, then
  // restore by reseeding (seedStartingEquipment recreates the deleted row).
  it("deleting one class's 2024 package rows makes the guard throw naming that class and edition", async () => {
    const monk2024 = await prisma.startingEquipmentPackage.findFirstOrThrow({
      where: { class: { name: "Monk" }, edition: "EDITION_2024" },
    });
    await prisma.startingEquipmentPackage.delete({ where: { id: monk2024.id } });

    await expect(assertEveryClassEditionHasPackage(prisma)).rejects.toThrow(/Monk \/ EDITION_2024/);

    // Restore — reseeding recreates every (classId, edition) pair.
    await seedStartingEquipment(prisma);
    await expect(assertEveryClassEditionHasPackage(prisma)).resolves.toBeDefined();
  });
});
