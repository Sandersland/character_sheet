// buildUnarmedAttacksView passes editionOf(row) into deriveUnarmedStrike/deriveMartialArtsDie — untested previously, a hardcoded EDITION_2024 there would silently roll a 2014 Monk's unarmed strike on the 2024 die forever (#1499).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-unarmed-strike-edition";
let COOKIE: string;

const BASE = {
  alignment: "Lawful Neutral",
  background: "Sage",
  classes: [{ name: "Monk" }],
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 8 },
};

// XP threshold keeps the total character level in agreement with the monk class-entry level being asserted.
const XP_BY_LEVEL: Record<number, number> = { 1: 0, 17: 225000, 20: 355000 };

async function createMonkAt(
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  name: string,
  level: 1 | 17 | 20,
): Promise<string> {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, ...anchor, name, rulesEdition });
  expect(res.status).toBe(201);
  const id = res.body.id as string;

  await prisma.character.update({ where: { id }, data: { experiencePoints: XP_BY_LEVEL[level] } });
  await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level } });
  return id;
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

const cleanup = () => prisma.character.deleteMany({ where: { name: { startsWith: "UnarmedEdition" } } });
afterEach(cleanup);
afterAll(cleanup);

describe("unarmedStrike Martial Arts die forks on rulesEdition (#1499)", () => {
  it("L1: EDITION_2014 rolls d4 (PHB'14 p.78), EDITION_2024 rolls d6 (SRD 5.2 / PHB'24 p.88)", async () => {
    const id2014 = await createMonkAt("EDITION_2014", "UnarmedEdition 2014-L1", 1);
    const id2024 = await createMonkAt("EDITION_2024", "UnarmedEdition 2024-L1", 1);

    const char2014 = (await get(id2014)).body;
    const char2024 = (await get(id2024)).body;

    expect(char2014.unarmedStrike.damage.faces).toBe(4);
    expect(char2024.unarmedStrike.damage.faces).toBe(6);
  });

  it("L17: EDITION_2014 rolls d10, EDITION_2024 rolls d12", async () => {
    const id2014 = await createMonkAt("EDITION_2014", "UnarmedEdition 2014-L17", 17);
    const id2024 = await createMonkAt("EDITION_2024", "UnarmedEdition 2024-L17", 17);

    const char2014 = (await get(id2014)).body;
    const char2024 = (await get(id2024)).body;

    expect(char2014.unarmedStrike.damage.faces).toBe(10);
    expect(char2024.unarmedStrike.damage.faces).toBe(12);
  });

  // The six EDITION_2024-only rows must not reach a 2014 monk's wire payload, while the shared bonusUnarmedStrike/flurryOfBlows rows and the 2014-exclusive patientDefenseKi/stepOfTheWindKi rows do (#1500).
  it("L20 EDITION_2014 monk: availableActions has none of the six 2024-only rows, has bonusUnarmedStrike/flurryOfBlows/patientDefenseKi/stepOfTheWindKi", async () => {
    const id = await createMonkAt("EDITION_2014", "UnarmedEdition 2014-L20", 20);
    const char = (await get(id)).body;
    const keys = (char.availableActions as { key: string }[]).map((a) => a.key);

    for (const tagged of [
      "patientDefense",
      "patientDefenseFocus",
      "stepOfTheWind",
      "stepOfTheWindFocus",
      "deflectAttacks",
      "deflectAttacksRedirect",
    ]) {
      expect(keys).not.toContain(tagged);
    }
    expect(keys).toContain("bonusUnarmedStrike");
    expect(keys).toContain("flurryOfBlows");
    expect(keys).toContain("patientDefenseKi");
    expect(keys).toContain("stepOfTheWindKi");
  });
});

describe("2014 Monk base-class feature list (#1500)", () => {
  it("L1: Unarmored Defense + Martial Arts in features, no resource pool yet", async () => {
    const id = await createMonkAt("EDITION_2014", "UnarmedEdition 2014-FeatureList-L1", 1);
    const char = (await get(id)).body;
    const names = (char.resources.features as { name: string }[]).map((f) => f.name);
    expect(names).toContain("Unarmored Defense");
    expect(names).toContain("Martial Arts");
    expect(char.resources.pools).toEqual([]);
  });

  it("L20: contains every 2014-only name and excludes every 2024-only name (converse holds for a 2024 monk)", async () => {
    const id2014 = await createMonkAt("EDITION_2014", "UnarmedEdition 2014-FeatureList-L20", 20);
    const id2024 = await createMonkAt("EDITION_2024", "UnarmedEdition 2024-FeatureList-L20", 20);
    const names2014 = ((await get(id2014)).body.resources.features as { name: string }[]).map((f) => f.name);
    const names2024 = ((await get(id2024)).body.resources.features as { name: string }[]).map((f) => f.name);

    const ONLY_2014 = ["Stillness of Mind", "Purity of Body", "Tongue of the Sun and Moon", "Diamond Soul", "Timeless Body", "Empty Body", "Perfect Self"];
    const ONLY_2024 = ["Uncanny Metabolism", "Heightened Focus", "Self-Restoration", "Deflect Energy", "Perfect Focus", "Superior Defense", "Body and Mind"];

    for (const name of ONLY_2014) {
      expect(names2014, name).toContain(name);
      expect(names2024, name).not.toContain(name);
    }
    for (const name of ONLY_2024) {
      expect(names2024, name).toContain(name);
      expect(names2014, name).not.toContain(name);
    }
  });
});
