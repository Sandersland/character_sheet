// DB-backed proof for #1565's cross-family prune partition: StartingEquipment
// Package now holds BOTH class rows (classId set) and background rows
// (backgroundId set), and pruneStaleClassPackages/pruneStaleBackgroundPackages
// (seed-starting-equipment.ts) sweep each partition independently via
// startingEquipmentStaleWhere's `extraWhere`. This is the notIn:[]
// empty-partition trap (already proven per-class in
// starting-equipment-fork-reseed.test.ts) proven ACROSS families: an empty
// `seeded` list for one family must never delete the OTHER family's rows,
// which is exactly what would happen if `extraWhere` were ever dropped or
// widened.
//
// Whole-table sweeps (unlike fork-reseed.test.ts's single-class scoping)
// because the real production extraWhere ({classId: {not: null}} /
// {backgroundId: {not: null}}) has no narrower real-world shape to reproduce
// faithfully — restored via seedStartingEquipment(prisma) in `afterEach`
// regardless of pass/fail, same unconditional-restore shape as
// starting-equipment-fork-reseed.test.ts.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedStartingEquipment, startingEquipmentStaleWhere } from "../seed-starting-equipment.js";

afterEach(async () => {
  await seedStartingEquipment(prisma);
});

afterAll(async () => {
  const acolyte2014 = await prisma.startingEquipmentPackage.findFirst({
    where: { background: { name: "Acolyte" }, edition: "EDITION_2014" },
  });
  const warlock2014 = await prisma.startingEquipmentPackage.findFirst({
    where: { class: { name: "Warlock" }, edition: "EDITION_2014" },
  });
  expect(acolyte2014, "Acolyte's real EDITION_2014 package must survive this suite").not.toBeNull();
  expect(warlock2014, "Warlock's real EDITION_2014 package must survive this suite").not.toBeNull();
});

describe("StartingEquipmentPackage prune — class/background partitions never cross-delete (#1565)", () => {
  it("an empty-seeded CLASS sweep (classId: {not: null}) deletes every class row but leaves every background row untouched", async () => {
    const backgroundCountBefore = await prisma.startingEquipmentPackage.count({ where: { backgroundId: { not: null } } });
    expect(backgroundCountBefore).toBe(8);

    // Reproduces the worst case: a `seeded` list that forgot every class
    // entirely (as if STARTING_EQUIPMENT_PACKAGES were empty) — the same
    // empty-partition trap the single-class fork-reseed suite proves, now
    // swept across the WHOLE class partition.
    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere([], { classId: { not: null } }),
    });

    expect(await prisma.startingEquipmentPackage.count({ where: { classId: { not: null } } })).toBe(0);
    // THE mutation proof this AC requires: background rows survive a sweep
    // that just deleted every class row in the table.
    expect(await prisma.startingEquipmentPackage.count({ where: { backgroundId: { not: null } } })).toBe(
      backgroundCountBefore,
    );
  });

  it("an empty-seeded BACKGROUND sweep (backgroundId: {not: null}) deletes every background row but leaves every class row untouched", async () => {
    const classCountBefore = await prisma.startingEquipmentPackage.count({ where: { classId: { not: null } } });
    expect(classCountBefore).toBe(24);

    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere([], { backgroundId: { not: null } }),
    });

    expect(await prisma.startingEquipmentPackage.count({ where: { backgroundId: { not: null } } })).toBe(0);
    // THE mutation proof this AC requires: class rows survive a sweep that
    // just deleted every background row in the table.
    expect(await prisma.startingEquipmentPackage.count({ where: { classId: { not: null } } })).toBe(classCountBefore);
  });

  it("reseeding after either sweep restores exactly the pre-sweep row count (32)", async () => {
    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere([], { backgroundId: { not: null } }),
    });
    expect(await prisma.startingEquipmentPackage.count()).toBe(24);

    await seedStartingEquipment(prisma);
    expect(await prisma.startingEquipmentPackage.count()).toBe(32);
  });
});
