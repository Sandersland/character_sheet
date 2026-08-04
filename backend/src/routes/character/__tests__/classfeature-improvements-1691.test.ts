/**
 * #1691: ClassFeature.improvements — passive row grants (FeatImprovement[])
 * mapped through the same deriveImprovementBonuses/deriveImprovementProficiencies
 * evaluator a taken feat's improvements already use. Proving case is Life
 * Domain's 2014 "Bonus Proficiency" row (cleric-features.ts): the prose says
 * "You gain proficiency with heavy armor" but nothing granted it — a live bug
 * this issue fixes on the EDITION_2014 row only (SRD 5.1 Life Domain grants
 * heavy armor at L1; SRD 5.2 Life does NOT — heavy armor comes via Divine
 * Order's Protector option instead). Exercised against seeded Cleric/Life
 * Domain data, mirroring subclass-active-edition-1291.test.ts's own pattern
 * (never a fixture class). Also covers the 2014 subclass prose sweep's other
 * fixed grant (Bard College of Valor's "Bonus Proficiencies": medium armor,
 * shield, Martial Weapons) and the no-double-grant AC.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-1691-classfeature-improvements";
let COOKIE: string;

const XP_LVL_3 = 900;
const XP_LVL_4 = 2700; // 1 ASI slot — needed for the no-double-grant custom-feat case

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;
let collegeOfValorId: string;

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

  const bard = await prisma.characterClass.findUnique({ where: { name: "Bard" }, select: { id: true } });
  if (!bard) throw new Error("Bard class not seeded — run `prisma db seed` before tests");
  const valor = await prisma.subclass.findFirst({
    where: { classId: bard.id, name: "College of Valor", edition: null },
    select: { id: true },
  });
  if (!valor) throw new Error("College of Valor subclass not seeded — run `prisma db seed` before tests");
  collegeOfValorId = valor.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1691 ClassFeature" } } });
});

async function createCharacter(
  name: string,
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  className: "Cleric" | "Bard" = "Cleric",
) {
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      race: "Hill Dwarf",
      background: "Sage",
      classes: [{ name: className }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function setSubclass(characterId: string, subclass: string, subclassId: string) {
  await prisma.characterClassEntry.updateMany({
    where: { characterId },
    data: { subclass, subclassId },
  });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

function armorCategories(body: { armorProficiencies: { category: string }[] }): string[] {
  return body.armorProficiencies.map((p) => p.category);
}

function weaponNames(body: { weaponProficiencies: { name: string }[] }): string[] {
  return body.weaponProficiencies.map((w) => w.name);
}

describe("ClassFeature.improvements (#1691) — Life Domain Bonus Proficiency, both editions pinned", () => {
  it("a level-1 2014 Life cleric serializes heavy-armor proficient — the row's own improvements, no TS change beyond the layer", async () => {
    const id = await createCharacter("1691 ClassFeature Cleric 2014", "EDITION_2014");
    await setSubclass(id, "Life Domain", lifeDomainId);

    const res = await get(id);
    expect(res.status).toBe(200);
    // Sanity: the subclass row itself is active at L1 in 2014 (mirrors #1291).
    expect(res.body.classes[0].subclass).toBe("Life Domain");
    expect(armorCategories(res.body)).toContain("heavy");
    const heavy = res.body.armorProficiencies.find((p: { category: string }) => p.category === "heavy");
    expect(heavy.source).toBe("feat"); // reuses the existing feat-provenance bucket, not a new one (#1691 scope)
  });

  it("a level-3 2024 Life cleric does NOT gain heavy armor from this row — no EDITION_2024 successor exists", async () => {
    const id = await createCharacter("1691 ClassFeature Cleric 2024", "EDITION_2024");
    await setSubclass(id, "Life Domain", lifeDomainId);
    // 2024 Life Domain gates at L3, not L1 (#1291) — level up so the subclass
    // (and its rows) are active, isolating the assertion to "no 2024 row",
    // not "subclass not yet active".
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].subclass).toBe("Life Domain");
    expect(armorCategories(res.body)).not.toContain("heavy");
  });
});

describe("ClassFeature.improvements (#1691) — 2014 subclass prose sweep, College of Valor Bonus Proficiencies", () => {
  it("a level-3 2014 Valor bard gains medium armor, shield, and Martial Weapons proficiency from the row alone", async () => {
    const id = await createCharacter("1691 ClassFeature Bard 2014", "EDITION_2014", "Bard");
    await setSubclass(id, "College of Valor", collegeOfValorId);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } }); // Valor gates at L3

    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].subclass).toBe("College of Valor");
    expect(armorCategories(res.body)).toContain("medium");
    expect(armorCategories(res.body)).toContain("shield");
    expect(weaponNames(res.body)).toContain("Martial Weapons");
  });
});

describe("ClassFeature.improvements (#1691) — no double-grant", () => {
  it("a proficiency granted by BOTH a custom feat and a class feature row appears once in armorProficiencies", async () => {
    const id = await createCharacter("1691 ClassFeature Bard NoDouble", "EDITION_2014", "Bard");
    await setSubclass(id, "College of Valor", collegeOfValorId);
    // L4: Valor's Bonus Proficiencies (medium armor, L3) is already active AND
    // an ASI slot is available for the custom feat below.
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_4 } });

    const advRes = await supertest(app)
      .post(`/api/characters/${id}/advancement/transactions`)
      .set("Cookie", COOKIE)
      .send({
        operations: [{
          type: "takeFeat",
          custom: {
            name: "Redundant Armor Training (custom)",
            description: "Test-only: re-grants an armor proficiency the subclass row already grants.",
            improvements: [{ target: "armorProficiency", amount: 1, key: "medium" }],
          },
        }],
      });
    expect(advRes.status).toBe(200);

    const res = await get(id);
    expect(res.status).toBe(200);
    // The existing dedup path (deriveImprovementProficiencies' Set) — not a
    // new one — is what collapses the feat's re-grant against the row's.
    const mediumEntries = res.body.armorProficiencies.filter((p: { category: string }) => p.category === "medium");
    expect(mediumEntries).toHaveLength(1);
  });
});
