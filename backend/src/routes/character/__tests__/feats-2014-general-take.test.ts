/**
 * #1310 acceptance criteria exercised over the REAL creation + advancement
 * transaction path — not fixture rows, and not resolveEditionRow called
 * directly — proving the 26-row 2014 general/origin catalog is actually
 * takeable, not merely present in a GET response.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-feats-2014-general-take";
let COOKIE: string;

const XP_LVL_4 = 2700; // level 4 — 1 ASI slot (BASE_ASI_LEVELS, both editions)

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "Feats2014" } } });
});

async function createCharacter(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string) {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
      background: "Sage",
      classes: [{ name: "Fighter" }],
      abilityScores: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
      rulesEdition,
      experiencePoints: XP_LVL_4,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function takeFeat(characterId: string, featId: string, abilityChoice?: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/advancement/transactions`)
    .set("Cookie", COOKIE)
    .send({ operations: [{ type: "takeFeat", featId, ...(abilityChoice ? { abilityChoice } : {}) }] });
}

describe("a 2014 character takes a real 2014 general-category feat via an ASI slot (#1310)", () => {
  it("takes Sentinel with NO abilityChoice and gains no ability increase (Sentinel has no PHB'14 half-feat bump)", async () => {
    const sentinel2014 = await prisma.feat.findFirstOrThrow({
      where: { name: "Sentinel", edition: "EDITION_2014" },
    });
    const id = await createCharacter("EDITION_2014", "Feats2014 Sentinel");

    const res = await takeFeat(id, sentinel2014.id);
    expect(res.status).toBe(200);

    const char = (await supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE)).body;
    const entry = char.advancements.find((a: { featName?: string }) => a.featName === "Sentinel");
    expect(entry).toBeDefined();
    expect(entry.abilityDeltas).toEqual({});
  });

  it("rejects a 2014 half-feat (Grappler has no 2014 bump either, so use Athlete) with no abilityChoice, and accepts it with one", async () => {
    const athlete2014 = await prisma.feat.findFirstOrThrow({
      where: { name: "Athlete", edition: "EDITION_2014" },
    });
    const id = await createCharacter("EDITION_2014", "Feats2014 Athlete");

    const missing = await takeFeat(id, athlete2014.id);
    expect(missing.status).toBe(400);

    const withChoice = await takeFeat(id, athlete2014.id, "strength");
    expect(withChoice.status).toBe(200);
    const char = (await supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE)).body;
    const entry = char.advancements.find((a: { featName?: string }) => a.featName === "Athlete");
    expect(entry.abilityDeltas).toEqual({ strength: 1 });
  });

  it("a 2014 character CANNOT take a 2014-tagged feat before level 4 (the `?? 4` general default, live)", async () => {
    const sentinel2014 = await prisma.feat.findFirstOrThrow({
      where: { name: "Sentinel", edition: "EDITION_2014" },
    });
    const anchor = await seededSpeciesAnchor("EDITION_2014");
    const res = await supertest(app)
      .post("/api/characters")
      .set("Cookie", COOKIE)
      .send({
        name: "Feats2014 TooLow",
        alignment: "True Neutral",
        ...anchor,
        background: "Sage",
        classes: [{ name: "Fighter" }],
        abilityScores: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
        rulesEdition: "EDITION_2014",
        experiencePoints: 0, // level 1 — no ASI slot at all
      });
    expect(res.status).toBe(201);
    const id = res.body.id as string;

    const takeRes = await takeFeat(id, sentinel2014.id);
    expect(takeRes.status).toBe(400);
  });

  it("a 2024 character is rejected (edition mismatch, not a category message) when submitting the 2014 Sentinel id", async () => {
    const sentinel2014 = await prisma.feat.findFirstOrThrow({
      where: { name: "Sentinel", edition: "EDITION_2014" },
    });
    const id = await createCharacter("EDITION_2024", "Feats2014 CrossEdition");

    const res = await takeFeat(id, sentinel2014.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });
});
