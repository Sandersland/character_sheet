// POST /api/characters — 2014 species/subrace ability increases baked at
// creation (#1681). Exercises the seeded catalog (real Species/SpeciesVariant
// rows from seedSpecies), same pattern as species-create.test.ts and the
// background ability-spread suite in characters.test.ts.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-species-ability-increases";
let COOKIE: string;
let createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  if (createdCharacterIds.length === 0) return;
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  createdCharacterIds = [];
});

async function post(body: object) {
  return supertest.agent(app).set("Cookie", COOKIE).post("/api/characters").send(body);
}

const BASE_SCORES = { strength: 12, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 };

const baseBody = {
  name: "Species Ability Tester",
  alignment: "True Neutral",
  background: "Acolyte",
  classes: [{ name: "Fighter" }],
  abilityScores: BASE_SCORES,
};

describe("POST /api/characters — 2014 fixed increases bake at creation (#1681)", () => {
  it("a Hill Dwarf's persisted scores include +2 CON (species) and +1 WIS (variant); HP/init derive from the increased scores", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;

    const res = await post({
      ...baseBody,
      race: "Hill Dwarf",
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    // CON 12 → 14 (species +2), WIS 10 → 11 (variant +1); everything else untouched.
    expect(res.body.abilityScores).toEqual({ ...BASE_SCORES, constitution: 14, wisdom: 11 });

    // CON 14 → +2 mod, Fighter d10 → 12 base; the Hill Dwarf's Dwarven Toughness
    // trait (#1682) adds +1/level → 13 at level 1.
    expect(res.body.hitPoints.max).toBe(13);
    // DEX 12 (unaffected by Dwarf's increases) → +1 mod, no other init bonus.
    expect(res.body.initiativeBonus).toBe(1);

    // Provenance snapshot: exactly what was applied, fixed + variant, nothing else.
    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual(
      expect.arrayContaining([
        { ability: "constitution", amount: 2 },
        { ability: "wisdom", amount: 1 },
      ]),
    );
    expect(raceRow.abilityBonuses).toHaveLength(2);
  });

  it("a fixed increase pushing a score past the 20 cap 400s (same cap family as the background spread)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const mountainDwarf = dwarf.variants.find((v) => v.slug === "mountain")!;

    const res = await post({
      ...baseBody,
      race: "Mountain Dwarf",
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: mountainDwarf.id,
      abilityScores: { ...BASE_SCORES, constitution: 19 },
    });

    expect(res.status).toBe(400);
    // Fixed +2 CON overflow — server-applied, so the error names "species", not
    // the speciesAbilities field the client never submitted here (#1681 review).
    expect(res.body.error).toBe("species: constitution would exceed 20");
  });

  it("a legacy race-name-only creation (no speciesId) applies no increase, unchanged from before #1681", async () => {
    const res = await post({ ...baseBody, race: "Hill Dwarf", rulesEdition: "EDITION_2014" });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual(BASE_SCORES);
  });
});

describe("POST /api/characters — 2014 choose-from-list increases (Half-Elf, #1681)", () => {
  async function halfElf2014() {
    return prisma.species.findFirstOrThrow({ where: { slug: "half-elf", edition: "EDITION_2014" } });
  }

  // Half-Elf ALSO carries a #1689 skill choice (Skill Versatility) as of this
  // slice — every request below must satisfy it too, or the skill-choice gate
  // (which resolves before ability increases, resolveSelections vs. the later
  // resolveSpeciesGrants phase) 400s before reaching the ability check this
  // file exists to exercise. Not overlapping with anything: baseBody sends no
  // skillProficiencies of its own.
  const SPECIES_SKILLS = ["stealth", "perception"];

  it("applies the fixed +2 CHA and the chosen +1/+1 to two distinct non-CHA abilities", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesAbilities: { strength: 1, dexterity: 1 },
      speciesSkills: SPECIES_SKILLS,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual({
      ...BASE_SCORES,
      charisma: 12,
      strength: 13,
      dexterity: 13,
    });

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual(
      expect.arrayContaining([
        { ability: "charisma", amount: 2 },
        { ability: "strength", amount: 1 },
        { ability: "dexterity", amount: 1 },
      ]),
    );
    expect(raceRow.abilityBonuses).toHaveLength(3);
  });

  it("400s with a distinct message when speciesAbilities is omitted entirely", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities required: this species grants a choice of ability increases");
  });

  it("400s with a distinct message for the wrong count (one ability instead of two)", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesAbilities: { strength: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities: choose exactly 2 distinct abilities (got 1)");
  });

  it("400s with a distinct message when charisma (already fixed) is chosen", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesAbilities: { charisma: 1, strength: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^speciesAbilities: charisma not eligible/);
  });

  it("400s with a distinct message for a wrong per-ability amount (+2 instead of +1)", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesAbilities: { strength: 2, dexterity: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities: each choice must be +1");
  });

  it("400s a choice pushing a score past the 20 cap", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      race: "Half-Elf",
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      abilityScores: { ...BASE_SCORES, strength: 20 },
      speciesAbilities: { strength: 1, dexterity: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities: strength would exceed 20");
  });

  it("400s speciesAbilities on a fixed-only species (Dwarf has no choice)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const res = await post({
      ...baseBody,
      race: "Hill Dwarf",
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
      speciesAbilities: { strength: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities not allowed: this species has no ability choice");
  });
});

describe("POST /api/characters — 2024 gets nothing from species, both directions (#1681)", () => {
  it("400s a submitted speciesAbilities under EDITION_2024", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const res = await post({
      ...baseBody,
      race: "Dwarf",
      rulesEdition: "EDITION_2024",
      speciesId: dwarf2024.id,
      speciesAbilities: { strength: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities not allowed: species ability increases are a 2014 rule");
  });

  it("a 2024 character's scores gain nothing from species even with one selected", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const res = await post({ ...baseBody, race: "Dwarf", rulesEdition: "EDITION_2024", speciesId: dwarf2024.id });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual(BASE_SCORES);

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual([]);
  });
});

// #1681 AC: the floating-spread shape (Astral Elf's "+2/+1-or-+1/+1/+1", seeded
// only as a #1679 test fixture — no real PHB'14 roster row uses it yet) must
// validate through the SAME shared function #1572's background spread uses.
// background-grants.test.ts asserts that by symbol (one import, two callers);
// this proves it behaviorally end-to-end through the real creation endpoint,
// including the identical rejection message text validateBackgroundSpread
// produces for an illegal shape.
describe("POST /api/characters — floating-spread species fixture (#1681 AC3)", () => {
  const FIXTURE_SLUG = "zzz-floating-fixture-1681";

  afterEach(async () => {
    await prisma.species.deleteMany({ where: { slug: FIXTURE_SLUG } });
  });

  it("accepts a legal +2/+1 floating spread and rejects an illegal shape with the shared validator's message", async () => {
    const fixture = await prisma.species.create({
      data: {
        name: "Zzz Floating Fixture",
        slug: FIXTURE_SLUG,
        speed: 30,
        edition: "EDITION_2014",
        abilityIncreases: [{ floating: 3 }],
      },
    });

    const illegalShape = await post({
      ...baseBody,
      race: "Human",
      rulesEdition: "EDITION_2014",
      speciesId: fixture.id,
      speciesAbilities: { strength: 3 },
    });
    expect(illegalShape.status).toBe(400);
    expect(illegalShape.body.error).toBe("speciesAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)");

    const legal = await post({
      ...baseBody,
      race: "Human",
      rulesEdition: "EDITION_2014",
      speciesId: fixture.id,
      speciesAbilities: { strength: 2, dexterity: 1 },
    });
    expect(legal.status).toBe(201);
    createdCharacterIds.push(legal.body.id);
    expect(legal.body.abilityScores).toEqual({ ...BASE_SCORES, strength: 14, dexterity: 13 });
  });
});
