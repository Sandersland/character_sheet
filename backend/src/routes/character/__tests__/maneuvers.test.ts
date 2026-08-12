/**
 * castManeuver route tests (#418). Level-3 Battle Master (Str 16, Cha 14) so the
 * superiority pool (4×d8), maneuver save DC (13), and Rally temp HP are
 * deterministic bounds. Covers: catalog spend + save DC on the event, Rally
 * self temp HP via the core path, custom (description-only) spend, die refunded
 * when the pool is empty, and the not-known error path.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-maneuvers";
let COOKIE: string;
const FIXTURE_ID = "test-maneuvers-character-1";
const CLASS_NAME = "Maneuvers Route Test Fighter";
const BM_SUBCLASS_NAME = "battle master"; // exact lowercase key deriveResources reads

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Maneuvers Test Battle Master",
  alignment: "Lawful Neutral",
  experiencePoints: 900, // level 3, prof +2
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0 },
  hitDice: { total: 3, die: "d10" },
  abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 14 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const maneuversUrl = `/api/characters/${FIXTURE_ID}/abilities/maneuvers/transactions`;

async function learn(op: unknown): Promise<{ id: string; name: string; maneuverId?: string }> {
  const res = await agent().post(resourcesUrl).send({ operations: [op] });
  const list = res.body.resources.maneuversKnown as Array<{ id: string; name: string; maneuverId?: string }>;
  return list[list.length - 1];
}

// #1412: the picker catalog itself. Fixture built through upsertEditionRow (a
// compound key containing `edition` rejects a literal null on
// findUnique/upsert) and deleted by NAME, never by an id var that would read to
// Prisma as "no filter" had beforeAll thrown partway.
describe("GET /api/maneuvers — required ?edition= + silent cross-edition omission", () => {
  const FIXTURE_NAME = "XEd Maneuver 2014";

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await upsertEditionRow(
      prisma.grantedAbility,
      { name: FIXTURE_NAME, edition: "EDITION_2014" },
      {
        name: FIXTURE_NAME,
        source: "maneuver",
        edition: "EDITION_2014",
        description: "Edition-filter test fixture.",
      },
      { source: "maneuver" },
    );
  });

  afterAll(async () => {
    await prisma.grantedAbility.deleteMany({ where: { name: FIXTURE_NAME } });
  });

  async function names(query: string): Promise<string[]> {
    const res = await agent().get(`/api/maneuvers${query}`);
    expect(res.status).toBe(200);
    return (res.body as { name: string }[]).map((m) => m.name);
  }

  it("400s an absent ?edition= rather than serving a flat cross-edition catalog", async () => {
    const res = await agent().get("/api/maneuvers");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
  });

  it("400s an unrecognized ?edition= with a message distinct from the missing-param one", async () => {
    const res = await agent().get("/api/maneuvers?edition=bogus");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Unknown edition: /);
  });

  it("omits a 2014-tagged row for a 2024 request and serves it for a 2014 one — no error, no marker", async () => {
    expect(await names("?edition=EDITION_2024")).not.toContain(FIXTURE_NAME);
    expect(await names("?edition=EDITION_2014")).toContain(FIXTURE_NAME);
  });

  it("serves the NULL-edition seeded rows to both editions", async () => {
    expect(await names("?edition=EDITION_2014")).toContain("Trip Attack");
    expect(await names("?edition=EDITION_2024")).toContain("Trip Attack");
  });
});

describe("POST /api/characters/:id/abilities/maneuvers/transactions", () => {
  let tripId: string;
  let rallyId: string;
  let bmSubclassId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
      update: { subclassLevel: 3 },
    });
    // #1546 Part B-ii: Battle Master's superiority-dice pool + announcedSaveDC
    // are ROW-driven now (fighter.ts's resourceFn/deriveExtras are gone) — a
    // bespoke Subclass row with no ClassFeature children would silently lose
    // both, same failure mode fighterResourceRowsData's own header describes
    // for the base class (#1546 Part B-i, Ruling 2). Shared helper, not a
    // per-file copy.
    const bm = await upsertEditionRow(
      prisma.subclass,
      { classId: cls.id, name: BM_SUBCLASS_NAME, edition: null },
      { classId: cls.id, name: BM_SUBCLASS_NAME, description: "Maneuvers.", slug: "fighter-battle-master-maneuvers-route-test" },
      {},
    );
    bmSubclassId = bm.id;
    await prisma.classFeature.deleteMany({ where: { subclassId: bmSubclassId } });
    await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(cls.id, bmSubclassId) });
    tripId = (await prisma.grantedAbility.findFirst({ where: { name: "Trip Attack" } }))!.id;
    rallyId = (await prisma.grantedAbility.findFirst({ where: { name: "Rally" } }))!.id;
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "battle master", subclassId: bmSubclassId, classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    // Scoped by subclassId/classId, never a bare name match — "battle master"
    // is also the real seeded catalog's subclass name and every other bespoke
    // fixture's, so an unscoped deleteMany here would cross-delete them.
    await prisma.classFeature.deleteMany({ where: { subclassId: bmSubclassId } });
    await prisma.subclass.deleteMany({ where: { id: bmSubclassId } });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("spends a die and announces the save DC on a catalog maneuver", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: tripId });
    expect(entry.maneuverId).toBe(tripId);

    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(8);
    expect(result.saveDc).toBe(13);
    expect(result.summary).toBe(`Used Trip Attack — d8:${result.roll}, DC 13 Str save`);

    const pool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "superiorityDice");
    expect(pool.remaining).toBe(3);
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one Trip Attack cast", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: tripId });
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    const { roll } = res.body.results[0];

    const known = [{
      id: entry.id, maneuverId: tripId, name: "Trip Attack", placement: "damageRoll", actionSlot: null,
      description:
        "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. " +
        "If the target is Large or smaller, it must make a Strength saving throw or be knocked prone.",
    }];
    const base = { maneuversKnown: known, toolProficienciesKnown: [], expertiseKnown: [], choicesKnown: {}, advancements: [] };

    expect(await readPinnedEvents(FIXTURE_ID, ["castManeuver", "spendResource"])).toEqual([
      {
        category: "resources",
        type: "castManeuver",
        summary: `Used Trip Attack — d8:${roll}, DC 13 Str save`,
        before: null,
        after: null,
        data: {
          entryId: entry.id, maneuverId: tripId, maneuverName: "Trip Attack",
          die: "d8", roll, saveDc: 13, saveAbility: "strength",
        },
      },
      {
        category: "resources",
        type: "spendResource",
        summary: "Spent 1 Superiority Dice — 3/4 remaining",
        before: { resources: { ...base, used: {} } },
        after: { resources: { ...base, used: { superiorityDice: 1 } } },
        data: { key: "superiorityDice", amount: 1, remaining: 3, roll: null },
      },
    ]);
  });

  it("Rally applies self temp HP (die + Cha mod) via the core self-apply path", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: rallyId });
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    const { roll } = res.body.results[0];
    expect(res.body.character.hitPoints.temp).toBe(roll + 2); // Cha 14 → +2
    expect(res.body.results[0].saveDc).toBeNull();
    expect(res.body.results[0].summary).toContain("temp HP");
  });

  it("a custom (description-only) maneuver is still spendable with no save DC", async () => {
    const entry = await learn({ type: "learnManeuver", custom: { name: "Homebrew Flourish", description: "d" } });
    expect(entry.maneuverId).toBeUndefined();
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].saveDc).toBeNull();
    expect(res.body.character.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").remaining).toBe(3);
  });

  it("400s casting a maneuver the character does not know", async () => {
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: "nope" }] });
    expect(res.status).toBe(400);
  });

  it("400s (die refunded) when no superiority dice remain", async () => {
    const entry = await learn({ type: "learnManeuver", maneuverId: tripId });
    // Drain all 4 dice.
    await agent().post(resourcesUrl).send({ operations: [{ type: "spendResource", key: "superiorityDice", amount: 4 }] });
    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(400);
    const check = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(check.body.resources.pools.find((p: { key: string }) => p.key === "superiorityDice").remaining).toBe(0);
  });
});

// #1546 Part B-ii: every OTHER Battle Master fixture in this repo is
// Str-primary (Str > Dex), so `deriveAnnouncedSaveDC`'s `Math.max(strMod,
// dexMod)` is untested in the one direction that would catch an operand swap
// (e.g. Math.max -> Math.min, or the two mods swapped) — a Str-primary
// character can't distinguish "the DC used the higher mod" from "the DC used
// Str specifically". Dex 18 (+4) > Str 10 (+0) here makes that distinction
// observable: DC 8 + prof(2) + max(0, 4) = 14, which only a genuine max()
// produces — min() would read 10, and a Str/Dex swap would read 10 too.
const DEX_FIXTURE_ID = "test-maneuvers-dex-primary-1";
const DEX_CLASS_NAME = "Maneuvers Route Test Fighter (Dex-primary)";
const DEX_BM_SUBCLASS_NAME = "battle master";

describe("castManeuver — Dex-primary Battle Master (Dex > Str), the max(Str,Dex) direction no other fixture catches", () => {
  let dexTripId: string;
  let dexClassId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: DEX_CLASS_NAME },
      create: { name: DEX_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
      update: { subclassLevel: 3 },
    });
    dexClassId = cls.id;
    const bm = await upsertEditionRow(
      prisma.subclass,
      { classId: cls.id, name: DEX_BM_SUBCLASS_NAME, edition: null },
      { classId: cls.id, name: DEX_BM_SUBCLASS_NAME, description: "Maneuvers.", slug: "fighter-battle-master-maneuvers-dex-primary-test" },
      {},
    );
    await prisma.classFeature.deleteMany({ where: { subclassId: bm.id } });
    await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(cls.id, bm.id) });
    dexTripId = (await prisma.grantedAbility.findFirst({ where: { name: "Trip Attack" } }))!.id;
    await prisma.character.create({
      data: {
        id: DEX_FIXTURE_ID,
        name: "Maneuvers Test Battle Master (Dex-primary)",
        alignment: "Lawful Neutral",
        experiencePoints: 900, // level 3, prof +2
        initiativeBonus: 4,
        speed: 30,
        hitPoints: { current: 24, max: 24, temp: 0 },
        hitDice: { total: 3, die: "d10" },
        abilityScores: { strength: 10, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: ["strength", "constitution"],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "battle master", subclassId: bm.id, classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: DEX_FIXTURE_ID } });
  });
  afterAll(async () => {
    // Scoped by classId (own bespoke class, never a bare name match) — "battle
    // master" is also the real seeded catalog's subclass name and every other
    // bespoke fixture's, so an unscoped deleteMany here would cross-delete them.
    await prisma.subclass.deleteMany({ where: { name: DEX_BM_SUBCLASS_NAME, classId: dexClassId } });
    await prisma.characterClass.deleteMany({ where: { name: DEX_CLASS_NAME } });
  });

  it("announces DC 14 (8 + prof 2 + Dex mod 4), not 10 (Str mod 0) — proves max(), not min() or a Str/Dex swap", async () => {
    const learnRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${DEX_FIXTURE_ID}/resources/transactions`)
      .send({ operations: [{ type: "learnManeuver", maneuverId: dexTripId }] });
    const entry = learnRes.body.resources.maneuversKnown.at(-1);

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${DEX_FIXTURE_ID}/abilities/maneuvers/transactions`)
      .send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].saveDc).toBe(14);
    expect(res.body.results[0].summary).toContain("DC 14 Str save"); // saveAbility is the catalog's (target's) ability, not the announcer's
  });
});
