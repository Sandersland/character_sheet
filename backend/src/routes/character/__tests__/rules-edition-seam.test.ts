import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

/**
 * The #1285 acceptance test: one rule (`subclassGateLevel`) resolved through the
 * edition seam, proving CLAUDE.md's invariant that a reconciler, its
 * clamp-on-read, and the write-side validation all resolve to the *same*
 * edition's function.
 *
 * Seeded Cleric/Sorcerer/Warlock/Druid/Wizard now carry a real 2014 gate below 3
 * too (#1308) — this fixture class predates that and stays useful for a
 * different reason: its name matches no entry in the registry's CLASSES map, so
 * deriveResources returns null and the test exercises only the catalog-driven
 * gate — isSubclassActive's independent grantLevel table (edition-aware since
 * #1291, but keyed on a class name this fixture never matches) can't interfere.
 */
const OWNER_ID = "owner-rules-edition-seam";
const CLASS_NAME = "Rules Edition Seam Wizard";
const SUBCLASS_NAME = "Rules Edition Seam School";
const XP_LEVEL_2 = 300;

let COOKIE: string;
let classId: string;
let subclassId: string;

const BASE = {
  alignment: "True Neutral",
  race: "Hill Dwarf",
  background: "Sage",
  classes: [{ name: CLASS_NAME }],
  abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 10, charisma: 8 },
};

/** Creates a character on the fixture class, then sets it to level 2 with the
 *  subclass already chosen — the state where the two editions disagree. */
async function makeCharacterAt2(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string) {
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, name, rulesEdition });
  expect(res.status).toBe(201);
  const id = res.body.id as string;

  await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LEVEL_2 } });
  await prisma.characterClassEntry.updateMany({
    where: { characterId: id },
    data: { level: 2, subclass: SUBCLASS_NAME, subclassId },
  });
  return id;
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    update: { subclassLevel: 2 },
    create: {
      name: CLASS_NAME,
      hitDie: "d6",
      subclassLevel: 2,
      savingThrows: ["intelligence", "wisdom"],
      skillChoiceCount: 0,
      skillChoices: [],
    },
  });
  classId = cls.id;

  const sub = await upsertEditionRow(
    prisma.subclass,
    { classId, name: SUBCLASS_NAME, edition: null },
    { classId, name: SUBCLASS_NAME, description: "Seam fixture.", slug: "rules-edition-seam-school" },
    {},
  );
  subclassId = sub.id;
});

// Cleanup filters on the uniquely-prefixed fixture NAMES, never on `classId` —
// if beforeAll threw, classId is undefined and Prisma reads that as "no filter",
// which would delete every seeded Subclass row.
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "SeamEdition" } } });
  await prisma.subclass.deleteMany({ where: { name: SUBCLASS_NAME } });
  await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
});

describe("the edition seam: one rule, three call sites that must agree (#1285)", () => {
  it("clamp-on-read shows the subclass at level 2 for 2014 and hides it for 2024", async () => {
    const id2014 = await makeCharacterAt2("EDITION_2014", "SeamEdition Read2014");
    const id2024 = await makeCharacterAt2("EDITION_2024", "SeamEdition Read2024");

    expect((await get(id2014)).body.classes[0].subclass).toBe(SUBCLASS_NAME);
    expect((await get(id2024)).body.classes[0].subclass).toBeUndefined();
  });

  it("reconcile-on-write clears the 2024 sheet's subclass and leaves the 2014 sheet's alone", async () => {
    const id2014 = await makeCharacterAt2("EDITION_2014", "SeamEdition Recon2014");
    const id2024 = await makeCharacterAt2("EDITION_2024", "SeamEdition Recon2024");

    for (const id of [id2014, id2024]) {
      const xp = await supertest(app)
        .post(`/api/characters/${id}/experience`)
        .set("Cookie", COOKIE)
        .send({ operations: [{ type: "set", value: XP_LEVEL_2 }] });
      expect(xp.status).toBe(200);
    }

    const entry2014 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2014 } });
    const entry2024 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2024 } });

    expect(entry2014.subclass).toBe(SUBCLASS_NAME);
    expect(entry2024.subclass).toBeNull();
    expect(entry2024.subclassId).toBeNull();

    const removed = await prisma.characterEvent.findFirst({
      where: { characterId: id2024, type: "subclassRemoved" },
    });
    expect(removed).not.toBeNull();
  });

  it("write-side validation accepts the level-2 subclass for 2014 and rejects it for 2024", async () => {
    const id2014 = await makeCharacterAt2("EDITION_2014", "SeamEdition Write2014");
    const id2024 = await makeCharacterAt2("EDITION_2024", "SeamEdition Write2024");

    // Clear both so setSubclass is a real transition rather than a no-op.
    await prisma.characterClassEntry.updateMany({
      where: { characterId: { in: [id2014, id2024] } },
      data: { subclass: null, subclassId: null },
    });

    const set = (id: string) =>
      supertest(app)
        .post(`/api/characters/${id}/class/transactions`)
        .set("Cookie", COOKIE)
        .send({ operations: [{ type: "setSubclass", subclassId }] });

    expect((await set(id2014)).status).toBe(200);
    expect((await set(id2024)).status).toBe(400);
  });
});
