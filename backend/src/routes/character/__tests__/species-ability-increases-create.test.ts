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
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    expect(res.body.abilityScores).toEqual({ ...BASE_SCORES, constitution: 14, wisdom: 11 });

    // Hill Dwarf's Dwarven Toughness trait (#1682) adds +1 HP/level on top of the CON mod.
    expect(res.body.hitPoints.max).toBe(13);
    expect(res.body.initiativeBonus).toBe(1);

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual(
      expect.arrayContaining([
        { ability: "constitution", amount: 2 },
        { ability: "wisdom", amount: 1 },
      ]),
    );
    expect(raceRow.abilityBonuses).toHaveLength(2);
  });

  // Cap is method-aware — see postBonusAbilityCap. baseBody declares no
  // abilityGenerationMethod, so the omitted-method sanity ceiling (30) applies here, not ABILITY_CAP (20, #1978).
  it("a fixed increase pushing a score past the 30 sanity ceiling 400s (same cap family as the background spread)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const mountainDwarf = dwarf.variants.find((v) => v.slug === "mountain")!;

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: mountainDwarf.id,
      abilityScores: { ...BASE_SCORES, constitution: 29 },
    });

    expect(res.status).toBe(400);
    // The +2 CON is server-applied, not client-submitted, so the error names "species", not speciesAbilities.
    expect(res.body.error).toBe("species: constitution would exceed 30");
  });
});

describe("POST /api/characters — 2014 choose-from-list increases (Half-Elf, #1681)", () => {
  async function halfElf2014() {
    return prisma.species.findFirstOrThrow({ where: { slug: "half-elf", edition: "EDITION_2014" } });
  }

  // Half-Elf also carries a #1689 skill choice (Skill Versatility) — resolveSelections gates on it before the later resolveSpeciesGrants phase, so every request below must satisfy it or 400 before reaching the ability check.
  const SPECIES_SKILLS = ["stealth", "perception"];

  it("applies the fixed +2 CHA and the chosen +1/+1 to two distinct non-CHA abilities", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
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
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      speciesAbilities: { strength: 2, dexterity: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities: each choice must be +1");
  });

  // baseBody declares no abilityGenerationMethod, so the omitted-method sanity
  // ceiling (30) applies here, not ABILITY_CAP (20, #1978) — see the Dwarf
  // fixed-increase test above for the same cap family.
  it("400s a choice pushing a score past the 30 sanity ceiling", async () => {
    const halfElf = await halfElf2014();
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: halfElf.id,
      abilityScores: { ...BASE_SCORES, strength: 30 },
      speciesAbilities: { strength: 1, dexterity: 1 },
      speciesSkills: SPECIES_SKILLS,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities: strength would exceed 30");
  });

  it("400s speciesAbilities on a fixed-only species (Dwarf has no choice)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
      speciesAbilities: { strength: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities not allowed: this species has no ability choice");
  });
});

// Astral Elf's floating spread REPLACES the base Elf's +2 DEX rather than stacking with it, unlike every other Elf subrace — guards fetchMergedAbilityIncreases' abilityIncreasesReplace branch both directions (#1751).
describe("POST /api/characters — Astral Elf replaces the base Elf's +2 DEX; real subraces still stack (#1751)", () => {
  async function elf2014() {
    return prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2014" },
      include: { variants: true },
    });
  }

  it("an Astral Elf gets ONLY the floating +2/+1 — the base Elf's +2 DEX is NOT applied", async () => {
    const elf = await elf2014();
    const astral = elf.variants.find((v) => v.slug === "astral")!;
    // Astral Fire is a wired chooseCantrip choice (#1756), so creation requires a cantrip + casting ability — unrelated to the ability-increase behavior under test.
    const light = await prisma.spell.findFirstOrThrow({ where: { name: "Light", edition: "EDITION_2014" } });

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: elf.id,
      variantId: astral.id,
      speciesAbilities: { strength: 2, wisdom: 1 },
      speciesCantripId: light.id,
      castingAbility: "wisdom",
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual({ ...BASE_SCORES, strength: 14, wisdom: 11 });

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual(
      expect.arrayContaining([
        { ability: "strength", amount: 2 },
        { ability: "wisdom", amount: 1 },
      ]),
    );
    expect(raceRow.abilityBonuses).toHaveLength(2);
  });

  it("regression: a Wood Elf still stacks +1 WIS on the base Elf's +2 DEX (additive, not replaced)", async () => {
    // Wood Elf, not High Elf — High Elf's Cantrip is a wired #1689 choice that would 400 for a missing speciesCantripId, unrelated to the behavior under test.
    const elf = await elf2014();
    const woodElf = elf.variants.find((v) => v.slug === "wood")!;

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: elf.id,
      variantId: woodElf.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual({ ...BASE_SCORES, dexterity: 14, wisdom: 11 });

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual(
      expect.arrayContaining([
        { ability: "dexterity", amount: 2 },
        { ability: "wisdom", amount: 1 },
      ]),
    );
    expect(raceRow.abilityBonuses).toHaveLength(2);
  });
});

describe("POST /api/characters — 2024 gets nothing from species, both directions (#1681)", () => {
  it("400s a submitted speciesAbilities under EDITION_2024", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: dwarf2024.id,
      speciesAbilities: { strength: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("speciesAbilities not allowed: species ability increases are a 2014 rule");
  });

  it("a 2024 character's scores gain nothing from species even with one selected", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const res = await post({ ...baseBody, rulesEdition: "EDITION_2024", speciesId: dwarf2024.id });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.abilityScores).toEqual(BASE_SCORES);

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.abilityBonuses).toEqual([]);
  });
});

// The floating-spread shape ("+2/+1" or "+1/+1/+1") validates through the same validateBackgroundSpread the background ability spread uses (#1572) — this proves it end-to-end through the real creation endpoint, including the shared rejection message text (#1681 AC3).
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
      rulesEdition: "EDITION_2014",
      speciesId: fixture.id,
      speciesAbilities: { strength: 3 },
    });
    expect(illegalShape.status).toBe(400);
    expect(illegalShape.body.error).toBe("speciesAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)");

    const legal = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: fixture.id,
      speciesAbilities: { strength: 2, dexterity: 1 },
    });
    expect(legal.status).toBe(201);
    createdCharacterIds.push(legal.body.id);
    expect(legal.body.abilityScores).toEqual({ ...BASE_SCORES, strength: 14, dexterity: 13 });
  });
});
