/**
 * 2014 subclass gate levels (#1308): CharacterClass.subclassLevel now holds the
 * PHB'14 gate for Cleric/Sorcerer/Warlock (1) and Druid/Wizard (2) — 2024 still
 * ignores the column (subclassGateLevel hardcodes 3). Exercised against the REAL
 * seeded Cleric/Wizard/Fighter + Life Domain/School of Evocation/subclass rows
 * (never a fixture class), per the issue's acceptance criteria.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1308-subclass-gate";
let COOKIE: string;

// XP thresholds (levelForExperience): L1=0, L2=300, L3=900.
const XP_LVL_1 = 0;
const XP_LVL_2 = 300;
const XP_LVL_3 = 900;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;
let evocationId: string;
let fighterSubclass: { id: string; name: string };

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const cleric = await prisma.characterClass.findUnique({ where: { name: "Cleric" }, select: { id: true } });
  if (!cleric) throw new Error("Cleric class not seeded — run `prisma db seed` before tests");
  // findFirst, not findUnique: the classId_name compound-key shorthand can't
  // express a null edition (#1306).
  const life = await prisma.subclass.findFirst({
    where: { classId: cleric.id, name: "Life Domain", edition: null },
    select: { id: true },
  });
  if (!life) throw new Error("Life Domain subclass not seeded — run `prisma db seed` before tests");
  lifeDomainId = life.id;

  const wizard = await prisma.characterClass.findUnique({ where: { name: "Wizard" }, select: { id: true } });
  if (!wizard) throw new Error("Wizard class not seeded — run `prisma db seed` before tests");
  const evocation = await prisma.subclass.findFirst({
    where: { classId: wizard.id, name: "School of Evocation", edition: null },
    select: { id: true },
  });
  if (!evocation) throw new Error("School of Evocation subclass not seeded — run `prisma db seed` before tests");
  evocationId = evocation.id;

  const fighter = await prisma.characterClass.findUnique({ where: { name: "Fighter" }, select: { id: true } });
  if (!fighter) throw new Error("Fighter class not seeded — run `prisma db seed` before tests");
  const found = await prisma.subclass.findFirst({ where: { classId: fighter.id }, select: { id: true, name: true } });
  if (!found) throw new Error("no Fighter subclass seeded");
  fighterSubclass = found;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1308 Gate" } } });
});

async function createCharacter(name: string, className: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
      background: "Sage",
      classes: [{ name: className }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function setSubclass(characterId: string, subclass: string, subclassId: string) {
  await prisma.characterClassEntry.updateMany({ where: { characterId }, data: { subclass, subclassId } });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

async function setXp(id: string, value: number) {
  const res = await supertest(app)
    .post(`/api/characters/${id}/experience`)
    .set("Cookie", COOKIE)
    .send({ operations: [{ type: "set", value }] });
  expect(res.status).toBe(200);
  return res;
}

describe("2014 subclass gate — seeded Cleric (gate 1) and Wizard (gate 2), #1308", () => {
  it("clamp-on-read: a level-1 2014 Cleric shows its subclass; a level-1 2024 Cleric does not", async () => {
    const id2014 = await createCharacter("1308 Gate Cleric 2014", "Cleric", "EDITION_2014");
    const id2024 = await createCharacter("1308 Gate Cleric 2024", "Cleric", "EDITION_2024");
    await setSubclass(id2014, "Life Domain", lifeDomainId);
    await setSubclass(id2024, "Life Domain", lifeDomainId);

    expect((await get(id2014)).body.classes[0].subclass).toBe("Life Domain");
    expect((await get(id2024)).body.classes[0].subclass).toBeUndefined();
  });

  it("clamp-on-read: a level-2 2014 Wizard shows its subclass; a level-2 2024 Wizard does not", async () => {
    const id2014 = await createCharacter("1308 Gate Wizard 2014", "Wizard", "EDITION_2014");
    const id2024 = await createCharacter("1308 Gate Wizard 2024", "Wizard", "EDITION_2024");
    await setSubclass(id2014, "School of Evocation", evocationId);
    await setSubclass(id2024, "School of Evocation", evocationId);
    await prisma.character.updateMany({
      where: { id: { in: [id2014, id2024] } },
      data: { experiencePoints: XP_LVL_2 },
    });

    expect((await get(id2014)).body.classes[0].subclass).toBe("School of Evocation");
    expect((await get(id2024)).body.classes[0].subclass).toBeUndefined();
  });

  it("reconcile-on-write: a 2014 Cleric keeps its subclass leveling down 3→2→1; a 2024 Cleric loses it at 3→2 and stays lost at 1", async () => {
    const id2014 = await createCharacter("1308 Gate Cleric Recon 2014", "Cleric", "EDITION_2014");
    const id2024 = await createCharacter("1308 Gate Cleric Recon 2024", "Cleric", "EDITION_2024");
    for (const id of [id2014, id2024]) {
      await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });
      await setSubclass(id, "Life Domain", lifeDomainId);
    }

    // Level 3 → 2: 2014's gate (1) is still satisfied; 2024's gate (3) is not.
    await setXp(id2014, XP_LVL_2);
    await setXp(id2024, XP_LVL_2);

    const entry2014AtL2 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2014 } });
    const entry2024AtL2 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2024 } });
    expect(entry2014AtL2.subclass).toBe("Life Domain");
    expect(entry2024AtL2.subclass).toBeNull();
    expect(entry2024AtL2.subclassId).toBeNull();

    const removed = await prisma.characterEvent.findFirst({
      where: { characterId: id2024, type: "subclassRemoved" },
    });
    expect(removed).not.toBeNull();

    // Level 2 → 1: 2014 keeps it (gate 1 still met); 2024 stays cleared.
    await setXp(id2014, XP_LVL_1);
    await setXp(id2024, XP_LVL_1);

    const entry2014AtL1 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2014 } });
    const entry2024AtL1 = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id2024 } });
    expect(entry2014AtL1.subclass).toBe("Life Domain");
    expect(entry2024AtL1.subclass).toBeNull();
  });

  it("Fighter is unaffected in both editions — gate stays 3", async () => {
    const id2014 = await createCharacter("1308 Gate Fighter 2014", "Fighter", "EDITION_2014");
    const id2024 = await createCharacter("1308 Gate Fighter 2024", "Fighter", "EDITION_2024");
    await setSubclass(id2014, fighterSubclass.name, fighterSubclass.id);
    await setSubclass(id2024, fighterSubclass.name, fighterSubclass.id);

    // Below the shared gate (level 2 < 3): hidden for both editions.
    await prisma.character.updateMany({
      where: { id: { in: [id2014, id2024] } },
      data: { experiencePoints: XP_LVL_2 },
    });
    expect((await get(id2014)).body.classes[0].subclass).toBeUndefined();
    expect((await get(id2024)).body.classes[0].subclass).toBeUndefined();

    // At the shared gate (level 3): visible for both editions.
    await prisma.character.updateMany({
      where: { id: { in: [id2014, id2024] } },
      data: { experiencePoints: XP_LVL_3 },
    });
    expect((await get(id2014)).body.classes[0].subclass).toBe(fighterSubclass.name);
    expect((await get(id2024)).body.classes[0].subclass).toBe(fighterSubclass.name);
  });
});

// #1308: character-create.ts's resolveSubclass HAD its OWN edition-blind gate
// check (characterClass.subclassLevel <= 1 / > 1) — a fourth call site the
// issue didn't name, found because it broke the instant the catalog column
// stopped being uniformly 3, and fixed in the same PR to resolve through
// subclassGateLevel(..., edition) like the rest. A brand-new character is
// always level 1, so this governs whether a subclassId may be supplied AT
// CREATION.
describe("character creation subclass gate (#1308)", () => {
  it("rejects a Life Domain subclassId at creation for a 2024 Cleric (gate 3, not creation)", async () => {
    const anchor = await seededSpeciesAnchor("EDITION_2024");
    const res = await supertest(app)
      .post("/api/characters")
      .set("Cookie", COOKIE)
      .send({
        name: "1308 Gate Create Cleric 2024",
        alignment: "True Neutral",
        ...anchor,
        background: "Sage",
        classes: [{ name: "Cleric", subclassId: lifeDomainId }],
        abilityScores: BASE_ABILITY_SCORES,
        rulesEdition: "EDITION_2024",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/grants its subclass at level 3/);
  });

  it("accepts a Life Domain subclassId at creation for a 2014 Cleric (gate 1 = creation)", async () => {
    const anchor = await seededSpeciesAnchor("EDITION_2014");
    const res = await supertest(app)
      .post("/api/characters")
      .set("Cookie", COOKIE)
      .send({
        name: "1308 Gate Create Cleric 2014",
        alignment: "True Neutral",
        ...anchor,
        background: "Sage",
        classes: [{ name: "Cleric", subclassId: lifeDomainId }],
        abilityScores: BASE_ABILITY_SCORES,
        rulesEdition: "EDITION_2014",
      });
    expect(res.status).toBe(201);
    expect(res.body.classes[0].subclass).toBe("Life Domain");
  });
});
