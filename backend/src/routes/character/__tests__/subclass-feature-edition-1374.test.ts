/**
 * #1374: DerivedFeature.edition — Cleric fork. #1308/#1291 made a 2014 Cleric
 * correctly derive its Life Domain features at level 1, but the TEXT was
 * still 2024-worded (the domain-spell tiers labelled (L3), not (L1)) — #1331's
 * worked example. This pins the 2014 fork's route-level behaviour against the
 * SEEDED catalog (never a fixture class), modelled on
 * subclass-active-edition-1291.test.ts.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const OWNER_ID = "owner-1374-subclass-feature-edition";
let COOKIE: string;
const app = createApp();

const XP_LVL_3 = 900;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const cleric = await prisma.characterClass.findUnique({ where: { name: "Cleric" }, select: { id: true } });
  if (!cleric) throw new Error("Cleric class not seeded — run `prisma db seed` before tests");
  const life = await prisma.subclass.findFirst({
    where: { classId: cleric.id, name: "Life Domain", edition: null },
    select: { id: true },
  });
  if (!life) throw new Error("Life Domain subclass not seeded — run `prisma db seed` before tests");
  lifeDomainId = life.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1374 Feature Ed" } } });
});

async function createCharacter(name: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      race: "Hill Dwarf",
      background: "Sage",
      classes: [{ name: "Cleric" }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function setSubclass(characterId: string) {
  await prisma.characterClassEntry.updateMany({
    where: { characterId },
    data: { subclass: "Life Domain", subclassId: lifeDomainId },
  });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

describe("2014 Cleric renders 2014 Domain Spells text; 2024 Cleric text is unchanged (#1374)", () => {
  it("a level-1 2014 Cleric's Domain Spells description labels the lowest tier (L1), not (L3)", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric 2014", "EDITION_2014");
    await setSubclass(id);

    const res = await get(id);
    expect(res.status).toBe(200);
    const domainSpells = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Domain Spells",
    );
    expect(domainSpells?.description).toContain("Bless, Cure Wounds (L1)");
    expect(domainSpells?.description).not.toContain("Bless, Cure Wounds (L3)");
  });

  it("a level-3 2024 Cleric's Domain Spells description is byte-identical to today (reverse-regression latch)", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric 2024", "EDITION_2024");
    await setSubclass(id);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    const domainSpells = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Domain Spells",
    );
    expect(domainSpells?.description).toBe(
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L3); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
    );
  });

  it("no feature on the wire carries an edition tag", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric Wire", "EDITION_2014");
    await setSubclass(id);

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as Record<string, unknown>[];
    expect(features.every((f) => !("edition" in f))).toBe(true);

    // Anti-vacuity control: without this half, the assertion above passes
    // trivially if the fork vanished entirely (no feature would ever carry a
    // tag to strip). Confirms deriveResources itself DOES tag the 2014 row —
    // the wire-level absence is toWireFeatures stripping it, not the fork
    // never existing.
    const info = deriveResources("cleric", "life domain", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), "EDITION_2014");
    const tagged = (info?.features ?? []).filter((f) => f.edition === "EDITION_2014");
    expect(tagged).toHaveLength(1);
  });
});
