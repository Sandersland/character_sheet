/**
 * #1307 acceptance test: a persisted exhaustion level's *meaning* forks on
 * Character.rulesEdition. Same stored number (e.g. 3), different rules —
 * 2014 tiered disadvantage + Speed-halved vs. 2024's flat −2×level/−5 ft×level
 * (SRD 5.2). Both editions asserted here side by side, end to end through
 * GET /api/characters/:id, mirroring rules-edition-seam.test.ts's pattern.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-exhaustion-edition";
let COOKIE: string;

// Hill Dwarf (speed 25, seeded catalog) keeps the Speed math simple and
// matches the fixture already used by rules-edition.test.ts / rules-edition-seam.test.ts.
const BASE = {
  alignment: "True Neutral",
  background: "Sage",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 15, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
};

async function createAt(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string, speciesName?: string) {
  const anchor = await seededSpeciesAnchor(rulesEdition, speciesName);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, ...anchor, name, rulesEdition });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function setExhaustion(id: string, level: number) {
  return supertest(app)
    .post(`/api/characters/${id}/conditions/transactions`)
    .set("Cookie", COOKIE)
    .send({ operations: [{ type: "setExhaustion", level }] });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

const cleanup = () => prisma.character.deleteMany({ where: { name: { startsWith: "ExhEdition" } } });
afterEach(cleanup);
afterAll(cleanup);

describe("exhaustion forks on rulesEdition (#1307)", () => {
  it("2014 exhaustion 3: disadvantage on attacks/checks/saves + half Speed (PHB'14 p. 291); 2024 exhaustion 3: −6 on d20 Tests + −15 ft Speed (SRD 5.2)", async () => {
    const id2014 = await createAt("EDITION_2014", "ExhEdition 2014-L3");
    const id2024 = await createAt("EDITION_2024", "ExhEdition 2024-L3");

    const setRes2014 = await setExhaustion(id2014, 3);
    expect(setRes2014.status).toBe(200);
    const setRes2024 = await setExhaustion(id2024, 3);
    expect(setRes2024.status).toBe(200);

    const char2014 = (await get(id2014)).body;
    const char2024 = (await get(id2024)).body;

    expect(char2014.speed).toBe(12); // Hill Dwarf 25, halved rounded down (PHB'14 p. 291)
    expect(char2014.rollModifiers).toEqual(
      expect.arrayContaining([
        { mode: "disadvantage", kind: "check", source: "Exhaustion" },
        { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
        { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
        { mode: "disadvantage", kind: "save", source: "Exhaustion" },
      ]),
    );
    // #1322 — the display sentence beside the Speed value and roll chips above:
    // must agree with both, never contradict them (the bug this issue fixes).
    expect(char2014.exhaustionEffectText).toBe(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed halved.",
    );

    // #1684: 2024 Dwarf is 30 ft (PHB'24 p. 22), NOT 2014's 25 ft — the two
    // editions' Dwarf rows genuinely differ, unlike the pre-#1684 legacy
    // `race`-name path, which resolved "Hill Dwarf" by name regardless of
    // the character's own rulesEdition.
    expect(char2024.speed).toBe(15); // 30 − 15 (−5 ft×level)
    expect(char2024.rollModifiers).toEqual(
      expect.arrayContaining([
        { mode: "flat", modifier: -6, kind: "attack", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "check", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "save", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "initiative", source: "Exhaustion" },
      ]),
    );
    expect(char2024.exhaustionEffectText).toBe("−6 on d20 Tests; Speed −15 ft.");
  });

  it("2014 exhaustion 2-4: an even base Speed (Human 30) halves cleanly, pinning the round-down direction from both sides", async () => {
    const id = await createAt("EDITION_2014", "ExhEdition 2014-Human-L2", "Human");
    await setExhaustion(id, 2);
    const char = (await get(id)).body;
    expect(char.speed).toBe(15); // 30 halved exactly — floor and ceil agree here
  });

  it("2014 exhaustion 5: Speed is exactly 0 — not negative, not 25 less than base", async () => {
    const id = await createAt("EDITION_2014", "ExhEdition 2014-L5");
    await setExhaustion(id, 5);
    const char = (await get(id)).body;
    expect(char.speed).toBe(0);
    expect(char.exhaustionEffectText).toBe(
      "Disadvantage on attack rolls, ability checks, saving throws, and initiative; Speed 0; HP maximum halved.",
    );
  });

  it("2014 exhaustion 1: disadvantage on ability checks only (Speed-halved doesn't start until level 2)", async () => {
    const id = await createAt("EDITION_2014", "ExhEdition 2014-L1");
    await setExhaustion(id, 1);
    const char = (await get(id)).body;
    expect(char.speed).toBe(25); // Hill Dwarf base, untouched
    expect(char.rollModifiers).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
    ]);
    expect(char.exhaustionEffectText).toBe("Disadvantage on ability checks and initiative.");
  });

  it("exhaustion 0: no active exhaustion, in both editions", async () => {
    const id2014 = await createAt("EDITION_2014", "ExhEdition 2014-L0");
    const id2024 = await createAt("EDITION_2024", "ExhEdition 2024-L0");
    expect((await get(id2014)).body.exhaustionEffectText).toBe("No exhaustion.");
    expect((await get(id2024)).body.exhaustionEffectText).toBe("No exhaustion.");
  });

  it("exhaustion 6 (death) is accepted identically in both editions — EXHAUSTION_MAX is edition-invariant", async () => {
    const id2014 = await createAt("EDITION_2014", "ExhEdition 2014-L6");
    const id2024 = await createAt("EDITION_2024", "ExhEdition 2024-L6");

    expect((await setExhaustion(id2014, 6)).status).toBe(200);
    expect((await setExhaustion(id2024, 6)).status).toBe(200);
    expect((await setExhaustion(id2014, 7)).status).toBe(400);
    expect((await setExhaustion(id2024, 7)).status).toBe(400);

    expect((await get(id2014)).body.conditions.exhaustion).toBe(6);
    expect((await get(id2024)).body.conditions.exhaustion).toBe(6);
  });
});

// #1321: PHB'14 p. 291 level-4 tier — "Hit point maximum halved" — plus the
// one-way current-HP clamp it forces (decisions 1/4/5). Direct prisma.character.create
// fixtures (not the species-anchored creation route above) so the stored
// hitPoints/hitDice/rulesEdition are exact and hand-authored, matching
// backend/src/routes/character/__tests__/hitpoints.test.ts's FIXTURE pattern.
const HP_FIXTURE_BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function createHpFixture(id: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  await prisma.character.create({
    data: {
      ...HP_FIXTURE_BASE,
      id,
      name: `ExhEdition ${id}`,
      ownerId: OWNER_ID,
      rulesEdition,
      hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 1, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
    },
  });
}

describe("exhaustion max-HP halving — PHB'14 p. 291 tier 4 (#1321)", () => {
  it.each([
    { level: 0, expectedMax: 30 },
    { level: 3, expectedMax: 30 },
    { level: 4, expectedMax: 15 },
    { level: 5, expectedMax: 15 },
    { level: 6, expectedMax: 15 },
  ])("2014, stored max 30, exhaustion $level → served max $expectedMax", async ({ level, expectedMax }) => {
    const id = `exh-hp-2014-${level}`;
    await createHpFixture(id, "EDITION_2014");
    await setExhaustion(id, level);
    const char = (await get(id)).body;
    expect(char.hitPoints.max).toBe(expectedMax);
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("2024, stored max 30, exhaustion %i → served max 30 (no 2024 HP tier, SRD 5.2)", async (level) => {
    const id = `exh-hp-2024-${level}`;
    await createHpFixture(id, "EDITION_2024");
    await setExhaustion(id, level);
    const char = (await get(id)).body;
    expect(char.hitPoints.max).toBe(30);
  });

  it("2014: raising exhaustion 3→4 PERSISTS the clamped current — re-read the row, not just the response (decision 4)", async () => {
    const id = "exh-hp-2014-clamp";
    await createHpFixture(id, "EDITION_2014");
    await setExhaustion(id, 3);

    const res = await setExhaustion(id, 4);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(15);
    expect(res.body.hitPoints.max).toBe(15);

    // Persisted, not just a read-time overlay on the response: re-read the raw
    // DB row's hitPoints.current directly.
    const row = await prisma.character.findUniqueOrThrow({ where: { id }, select: { hitPoints: true } });
    expect((row.hitPoints as { current: number }).current).toBe(15);
  });

  it("2014: dropping 4→3 serves max 30 but current stays 15 — the hit points are NOT handed back (decision 5, the whole point of the design)", async () => {
    const id = "exh-hp-2014-no-refund";
    await createHpFixture(id, "EDITION_2014");
    await setExhaustion(id, 4);
    expect((await get(id)).body.hitPoints.current).toBe(15);

    const res = await setExhaustion(id, 3);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(30);
    expect(res.body.hitPoints.current).toBe(15);
  });

  it("2014: current below the halved max is left untouched by the clamp (no snap-up)", async () => {
    const id = "exh-hp-2014-below";
    await createHpFixture(id, "EDITION_2014");
    await prisma.character.update({
      where: { id },
      data: { hitPoints: { current: 5, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } } },
    });
    const res = await setExhaustion(id, 4);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(5);
  });
});
