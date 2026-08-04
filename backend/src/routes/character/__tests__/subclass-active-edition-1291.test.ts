/**
 * #1291: isSubclassActive (lib/classes/registry.ts) used the code-side
 * grantLevel table edition-blind, independent of subclassGateLevel (the
 * catalog-column gate #1285/#1308 made edition-aware). Live bug on seeded data:
 * a 2014 Cleric at level 1 shows its subclass NAME (buildClassesView, via
 * subclassActiveAt) but none of its derived FEATURES/pools (deriveResources,
 * via isSubclassActive) — the two gates disagreed the moment #1308 seeded real
 * 2014 subclassLevel values. Exercised against seeded Cleric/Life Domain, per
 * the issue's acceptance criteria (never a fixture class).
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1291-subclass-active";
let COOKIE: string;

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
  // findFirst, not findUnique: the classId_name compound-key shorthand can't
  // express a null edition (#1306).
  const life = await prisma.subclass.findFirst({
    where: { classId: cleric.id, name: "Life Domain", edition: null },
    select: { id: true },
  });
  if (!life) throw new Error("Life Domain subclass not seeded — run `prisma db seed` before tests");
  lifeDomainId = life.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1291 Active" } } });
});

async function createCharacter(name: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
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

describe("isSubclassActive agrees with subclassGateLevel per edition (#1291)", () => {
  it("a level-1 2014 Cleric derives its subclass NAME and its FEATURES/pools together", async () => {
    const id = await createCharacter("1291 Active Cleric 2014", "EDITION_2014");
    await setSubclass(id);

    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].subclass).toBe("Life Domain");
    // The bug: deriveResources (registry.ts isSubclassActive) stayed gated at 3
    // (edition-blind) while buildClassesView (subclassActiveAt) correctly opened
    // at 1 for 2014 — so this array was empty even though the name showed above.
    const featureNames = (res.body.resources.features as { name: string }[]).map((f) => f.name);
    expect(featureNames).toContain("Domain Spells");
    expect(featureNames).toContain("Bonus Proficiency");
    expect(featureNames).toContain("Disciple of Life");
  });

  it("a level-1 2024 Cleric shows neither the subclass name nor its features; both appear at level 3", async () => {
    const id = await createCharacter("1291 Active Cleric 2024", "EDITION_2024");
    await setSubclass(id);

    const atL1 = await get(id);
    expect(atL1.body.classes[0].subclass).toBeUndefined();
    expect((atL1.body.resources?.features ?? []).map((f: { name: string }) => f.name)).not.toContain("Domain Spells");

    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });
    const atL3 = await get(id);
    expect(atL3.body.classes[0].subclass).toBe("Life Domain");
    // #1225: the 2024 row's real SRD 5.2 name is "Life Domain Spells", not
    // "Domain Spells" (that name/text was a fabricated placeholder retired
    // this issue — see cleric-features.ts's own header).
    expect((atL3.body.resources.features as { name: string }[]).map((f) => f.name)).toContain("Life Domain Spells");
  });
});
