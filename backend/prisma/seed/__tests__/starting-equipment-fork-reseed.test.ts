// StartingEquipmentPackage.classId is a REQUIRED FK, so every destructive call here is scoped to a real class (Warlock) rather than a synthetic fixture row.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedStartingEquipment, startingEquipmentStaleWhere } from "../seed-starting-equipment.js";

const CLASS_NAME = "Warlock";

async function warlockClassId(): Promise<string> {
  return (await prisma.characterClass.findFirstOrThrow({ where: { name: CLASS_NAME } })).id;
}

afterEach(async () => {
  await seedStartingEquipment(prisma);
});

afterAll(async () => {
  const warlock2014 = await prisma.startingEquipmentPackage.findFirst({
    where: { class: { name: CLASS_NAME }, edition: "EDITION_2014" },
  });
  expect(warlock2014, "Warlock's real EDITION_2014 package must survive this suite").not.toBeNull();
});

describe("StartingEquipmentPackage prune — per-edition seeded list preserves both forks (#1533 [R7])", () => {
  it("repeated (idempotent) prune calls with both editions threaded keep both packages", async () => {
    const classId = await warlockClassId();
    const seeded = [
      { identity: CLASS_NAME, edition: "EDITION_2014" as const },
      { identity: CLASS_NAME, edition: "EDITION_2024" as const },
    ];
    for (let run = 0; run < 2; run += 1) {
      await prisma.startingEquipmentPackage.deleteMany({
        where: startingEquipmentStaleWhere(seeded, { classId }),
      });
    }
    const remaining = await prisma.startingEquipmentPackage.findMany({ where: { classId } });
    expect(remaining.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});

describe("StartingEquipmentPackage prune — the notIn:[] empty-partition trap (#1533 [R7])", () => {
  // A seeded list missing EDITION_2024 gives that partition notIn: [], which matches (and deletes) every row in it — including the current package, not just a stale one.
  it("a seeded list missing EDITION_2024 deletes Warlock's CURRENT 2024 package too", async () => {
    const classId = await warlockClassId();
    const seeded2014Only = [{ identity: CLASS_NAME, edition: "EDITION_2014" as const }];

    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere(seeded2014Only, { classId }),
    });

    const remaining = await prisma.startingEquipmentPackage.findMany({ where: { classId } });
    expect(remaining.map((r) => r.edition)).toEqual(["EDITION_2014"]);
  });

  it("an unmatched identity value in `seeded` prunes the row it was meant to keep", async () => {
    const classId = await warlockClassId();
    const wrongName = [
      { identity: "Not Warlock", edition: "EDITION_2014" as const },
      { identity: "Not Warlock", edition: "EDITION_2024" as const },
    ];

    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere(wrongName, { classId }),
    });

    expect(await prisma.startingEquipmentPackage.count({ where: { classId } })).toBe(0);
  });
});
