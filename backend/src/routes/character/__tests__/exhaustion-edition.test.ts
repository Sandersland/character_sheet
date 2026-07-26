/**
 * #1307 acceptance test: a persisted exhaustion level's *meaning* forks on
 * Character.rulesEdition. Same stored number (e.g. 3), different rules —
 * 2014 tiered disadvantage + Speed-halved vs. 2024's flat −2×level/−5 ft×level
 * (SRD 5.2). Both editions asserted here side by side, end to end through
 * GET /api/characters/:id, mirroring rules-edition-seam.test.ts's pattern.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-exhaustion-edition";
let COOKIE: string;
const app = createApp();

// Hill Dwarf (speed 25, seeded catalog) keeps the Speed math simple and
// matches the fixture already used by rules-edition.test.ts / rules-edition-seam.test.ts.
const BASE = {
  alignment: "True Neutral",
  race: "Hill Dwarf",
  background: "Sage",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 15, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
};

async function createAt(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string) {
  const res = await supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...BASE, name, rulesEdition });
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

    // exhaustionSpeedPenalty subtracts floor(currentSpeed/2) — for an odd base
    // like Hill Dwarf's 25, that leaves 13, not floor(25/2)=12 (#1307 settled formula).
    expect(char2014.speed).toBe(13);
    expect(char2014.rollModifiers).toEqual(
      expect.arrayContaining([
        { mode: "disadvantage", kind: "check", source: "Exhaustion" },
        { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
        { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
        { mode: "disadvantage", kind: "save", source: "Exhaustion" },
      ]),
    );

    expect(char2024.speed).toBe(10); // 25 − 15 (−5 ft×level)
    expect(char2024.rollModifiers).toEqual(
      expect.arrayContaining([
        { mode: "flat", modifier: -6, kind: "attack", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "check", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "save", source: "Exhaustion" },
        { mode: "flat", modifier: -6, kind: "initiative", source: "Exhaustion" },
      ]),
    );
  });

  it("2014 exhaustion 5: Speed is exactly 0 — not negative, not 25 less than base", async () => {
    const id = await createAt("EDITION_2014", "ExhEdition 2014-L5");
    await setExhaustion(id, 5);
    const char = (await get(id)).body;
    expect(char.speed).toBe(0);
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
