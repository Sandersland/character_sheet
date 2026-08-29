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

    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere([], { classId: { not: null } }),
    });

    expect(await prisma.startingEquipmentPackage.count({ where: { classId: { not: null } } })).toBe(0);
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
