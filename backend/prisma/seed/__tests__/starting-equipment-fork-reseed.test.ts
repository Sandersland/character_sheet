// DB-backed proof for #1533 [R7]'s fork/prune shape: StartingEquipmentPackage
// forks per (classId, edition) exactly like ClassFeature/Action do, and the
// SAME notIn:[] empty-partition trap staleCatalogRowsWhere's own header
// documents is live here too (startingEquipmentStaleWhere reproduces it
// deliberately, restricted to the two real editions — see that function's
// comment in seed-starting-equipment.ts for why the shared helper can't be
// used directly on a NON-NULLABLE edition column). Modelled on
// action-fork-reseed.test.ts.
//
// Fixture rules: StartingEquipmentPackage.classId is a REQUIRED FK (unlike
// Action.key, which needed no real row to fake) — there is no synthetic-key
// equivalent, so this file scopes every destructive call to ONE REAL class
// (Warlock) via `extraWhere: { classId }` and reseeds in `afterEach`
// (whether the test passed or failed) so no other test in this file, this
// worker, or the guard suite's own assertions ever observes Warlock missing
// a package. Deliberately does NOT create a transient CharacterClass row —
// that is the #1543 leaking-fixture shape the arbiter warned this loop away
// from repeating.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedStartingEquipment, startingEquipmentStaleWhere } from "../seed-starting-equipment.js";

const CLASS_NAME = "Warlock";

async function warlockClassId(): Promise<string> {
  return (await prisma.characterClass.findFirstOrThrow({ where: { name: CLASS_NAME } })).id;
}

afterEach(async () => {
  // Unconditional restore — reseeding recreates every (classId, edition) this
  // file may have pruned away, whether the test above passed or failed.
  await seedStartingEquipment(prisma);
});

// Proves the scoping above held: if any test in this file leaked past
// Warlock, the real seeded package for it is gone and this is what goes red.
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
  // THE mutation proof this AC requires: a `seeded` list that omits
  // EDITION_2024 gives that partition `notIn: []`, which matches (and
  // deletes) EVERY row in it — the CURRENT 2024 package, not merely a stale
  // one. This is exactly what a seedStartingEquipment call that forgot to
  // thread both editions into `seeded` would reintroduce (verified by
  // temporarily threading only EDITION_2014 through pruneStalePackages
  // during development — reverted once this test itself reproduced the
  // failure it now guards, see the PR description).
  it("a seeded list missing EDITION_2024 deletes Warlock's CURRENT 2024 package too", async () => {
    const classId = await warlockClassId();
    const seeded2014Only = [{ identity: CLASS_NAME, edition: "EDITION_2014" as const }];

    await prisma.startingEquipmentPackage.deleteMany({
      where: startingEquipmentStaleWhere(seeded2014Only, { classId }),
    });

    const remaining = await prisma.startingEquipmentPackage.findMany({ where: { classId } });
    expect(remaining.map((r) => r.edition)).toEqual(["EDITION_2014"]);
  });

  // The identity column matters, same as Action's: a wrong `name` value in
  // `seeded` (e.g. a stale display name) fails to protect the row it should.
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
