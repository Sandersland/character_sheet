// Champion's Additional Fighting Style feat slot: L7 in 2024 (SRD 5.2 p.82), L10 in 2014 (PHB'14 p.72).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { levelForExperience } from "@/lib/leveling/experience.js";

const OWNER_ID = "owner-champion-fs";
const FIXTURE_ID = "test-champion-fs-1";

let COOKIE: string;
let fighterClassId: string;
let championSubclassId: string;
let archery2024Id: string;
let defense2024Id: string;
let archery2014Id: string;
let defense2014Id: string;

const advUrl = () => `/api/characters/${FIXTURE_ID}/advancement/transactions`;
const xpUrl = () => `/api/characters/${FIXTURE_ID}/experience`;
const get = () => supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
const takeStyle = (featId: string) =>
  supertest.agent(app).set("Cookie", COOKIE).post(advUrl()).send({
    operations: [{ type: "takeFeat", featId, slot: "fightingStyle" }],
  });
const setXp = (value: number) =>
  supertest.agent(app).set("Cookie", COOKIE).post(xpUrl()).send({ operations: [{ type: "set", value }] });

const L6_XP = 14000;
const L7_XP = 23000;
const L9_XP = 48000;
const L10_XP = 64000;

// hitDice.total tracks the XP-derived level at creation, so a later setXp DOWN drives revertLevelUps' real level-down path instead of an artificial mismatch.
async function createFighter(id: string, ownerId: string, xp: number, rulesEdition: "EDITION_2014" | "EDITION_2024", subclassId: string | null) {
  const level = levelForExperience(xp);
  await prisma.character.create({
    data: {
      id, name: "Champion FS Fixture", alignment: "True Neutral",
      ownerId, experiencePoints: xp, initiativeBonus: 3, speed: 30,
      rulesEdition,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: level, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [], skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: {
        create: [{ position: 0, name: "Fighter", classId: fighterClassId, level, subclass: subclassId ? "Champion" : null, subclassId }],
      },
    },
  });
}

// A pending level-up needs experiencePoints at the target level's threshold while hitDice.total (and the entry's own level) stay at the level below it.
async function createPendingFighter(
  id: string,
  ownerId: string,
  currentLevel: number,
  targetXp: number,
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  name: string,
  subclass: string | null,
  subclassId: string | null,
) {
  await prisma.character.create({
    data: {
      id, name: "Champion FS Fixture", alignment: "True Neutral",
      ownerId, experiencePoints: targetXp, initiativeBonus: 3, speed: 30,
      rulesEdition,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: currentLevel, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [], skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: {
        create: [{ position: 0, name, classId: fighterClassId, level: currentLevel, subclass, subclassId }],
      },
    },
  });
}

beforeAll(async () => {
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
  championSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { name: "Champion" }, select: { id: true } })).id;
  archery2024Id = (await prisma.feat.findFirstOrThrow({ where: { name: "Archery", edition: "EDITION_2024" }, select: { id: true } })).id;
  defense2024Id = (await prisma.feat.findFirstOrThrow({ where: { name: "Defense", edition: "EDITION_2024" }, select: { id: true } })).id;
  archery2014Id = (await prisma.feat.findFirstOrThrow({ where: { name: "Archery", edition: "EDITION_2014" }, select: { id: true } })).id;
  defense2014Id = (await prisma.feat.findFirstOrThrow({ where: { name: "Defense", edition: "EDITION_2014" }, select: { id: true } })).id;
});

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("2024 Champion", () => {
  it("has 1 fighting-style slot at L6, 2 at L7", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L6_XP, "EDITION_2024", championSubclassId);
    const atL6 = (await get()).body;
    expect(atL6.fightingStyleSlots.total).toBe(1);

    const bump = await setXp(L7_XP);
    expect(bump.status).toBe(200);
    const atL7 = (await get()).body;
    expect(atL7.fightingStyleSlots.total).toBe(2);
  });

  it("a non-Champion fighter stays at 1 slot at L7", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L7_XP, "EDITION_2024", null);
    const body = (await get()).body;
    expect(body.fightingStyleSlots.total).toBe(1);
  });

  it("both slots are usable, and level-down from 7 to 6 reverses the excess fighting-style feat", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L7_XP, "EDITION_2024", championSubclassId);
    expect((await takeStyle(archery2024Id)).status).toBe(200);
    expect((await takeStyle(defense2024Id)).status).toBe(200);
    const atL7 = (await get()).body;
    expect(atL7.fightingStyleSlots.total).toBe(2);
    expect(atL7.fightingStyleSlots.used).toBe(2);

    const down = await setXp(L6_XP);
    expect(down.status).toBe(200);
    const atL6 = (await get()).body;
    expect(atL6.fightingStyleSlots.total).toBe(1);
    expect(atL6.fightingStyleSlots.used).toBe(1);
  });
});

describe("2014 Champion", () => {
  it("has 1 fighting-style slot at L9, 2 at L10", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L9_XP, "EDITION_2014", championSubclassId);
    const atL9 = (await get()).body;
    expect(atL9.fightingStyleSlots.total).toBe(1);

    const bump = await setXp(L10_XP);
    expect(bump.status).toBe(200);
    const atL10 = (await get()).body;
    expect(atL10.fightingStyleSlots.total).toBe(2);
  });

  it("a non-Champion fighter stays at 1 slot at L10", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L10_XP, "EDITION_2014", null);
    const body = (await get()).body;
    expect(body.fightingStyleSlots.total).toBe(1);
  });

  it("both slots are usable, and level-down from 10 to 9 reverses the excess fighting-style feat", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L10_XP, "EDITION_2014", championSubclassId);
    expect((await takeStyle(archery2014Id)).status).toBe(200);
    expect((await takeStyle(defense2014Id)).status).toBe(200);
    const atL10 = (await get()).body;
    expect(atL10.fightingStyleSlots.total).toBe(2);
    expect(atL10.fightingStyleSlots.used).toBe(2);

    const down = await setXp(L9_XP);
    expect(down.status).toBe(200);
    const atL9 = (await get()).body;
    expect(atL9.fightingStyleSlots.total).toBe(1);
    expect(atL9.fightingStyleSlots.used).toBe(1);
  });

  it("a 2014 Champion at L7 (2024's own threshold) still has only 1 slot", async () => {
    await createFighter(FIXTURE_ID, OWNER_ID, L7_XP, "EDITION_2014", championSubclassId);
    const body = (await get()).body;
    expect(body.fightingStyleSlots.total).toBe(1);
  });
});

describe("level-up ceremony (POST …/level-up/transactions)", () => {
  const levelUpUrl = () => `/api/characters/${FIXTURE_ID}/level-up/transactions`;

  async function levelUpWithEntry(featId: string) {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: FIXTURE_ID } });
    return supertest.agent(app).set("Cookie", COOKIE).post(levelUpUrl()).send({
      target: { kind: "existing" as const, classEntryId: entry.id },
      hp: { method: "average" as const },
      fightingStyleFeat: { type: "takeFeat" as const, featId },
    });
  }

  it("a 2024 Champion 6→7 ceremony offers and commits the second fighting-style feat", async () => {
    await createPendingFighter(FIXTURE_ID, OWNER_ID, 6, L7_XP, "EDITION_2024", "Fighter", "Champion", championSubclassId);
    const res = await levelUpWithEntry(archery2024Id);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].level).toBe(7);
    expect(res.body.fightingStyleSlots).toMatchObject({ total: 2, used: 1 });
  });

  it("a 2014 Champion 9→10 ceremony offers and commits the second fighting-style feat", async () => {
    await createPendingFighter(FIXTURE_ID, OWNER_ID, 9, L10_XP, "EDITION_2014", "Fighter", "Champion", championSubclassId);
    const res = await levelUpWithEntry(archery2014Id);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].level).toBe(10);
    expect(res.body.fightingStyleSlots).toMatchObject({ total: 2, used: 1 });
  });

  // CharacterClassEntry.name/subclass are free-to-diverge display columns (#1495) — resolveSubclassSlug must use the real subclassId FK, not this drifting text.
  it("a 2024 Champion 6→7 ceremony still offers the second slot when the entry's name/subclass display text has drifted", async () => {
    await createPendingFighter(
      FIXTURE_ID, OWNER_ID, 6, L7_XP, "EDITION_2024",
      "Fightah (renamed)", "Champ (renamed)", championSubclassId,
    );
    const res = await levelUpWithEntry(archery2024Id);
    expect(res.status).toBe(200);
    expect(res.body.fightingStyleSlots).toMatchObject({ total: 2, used: 1 });
  });
});
