import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-species-casting-ability";
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
  name: "Casting Ability Tester",
  alignment: "True Neutral",
  background: "Acolyte",
  classes: [{ name: "Fighter" }],
  abilityScores: BASE_SCORES,
  rulesEdition: "EDITION_2024" as const,
};

async function drow() {
  const elf = await prisma.species.findFirstOrThrow({
    where: { slug: "elf", edition: "EDITION_2024" },
    include: { variants: true },
  });
  return { elf, drowVariant: elf.variants.find((v) => v.slug === "drow")! };
}

describe("POST /api/characters — 2024 lineage casting-ability choice (#1683)", () => {
  it("a Drow Elf's chosen castingAbility snapshots onto CharacterRace", async () => {
    const { elf, drowVariant } = await drow();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: drowVariant.id,
      castingAbility: "charisma",
      // Every 2024 Elf lineage also carries the species-level Keen Senses trait — a real, required choice, not a stray field (#1690).
      speciesSkills: ["survival"],
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.castingAbility).toBe("charisma");
  });

  it("400s with a distinct message when castingAbility is omitted for a spell-granting lineage", async () => {
    const { elf, drowVariant } = await drow();
    // speciesSkills (#1690's Keen Senses) supplied so the 400 below is provably castingAbility's own rejection, not an earlier one.
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: drowVariant.id,
      speciesSkills: ["survival"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("castingAbility required: this species/variant grants spells with a chosen casting ability");
  });

  it("400s an invalid castingAbility value (not one of intelligence/wisdom/charisma)", async () => {
    const { elf, drowVariant } = await drow();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: drowVariant.id,
      castingAbility: "strength",
      speciesSkills: ["survival"],
    });
    expect(res.status).toBe(400);
  });

  it("400s a submitted castingAbility for a species/variant that grants no spells (Dragonborn ancestry)", async () => {
    const dragonborn = await prisma.species.findFirstOrThrow({
      where: { slug: "dragonborn", edition: "EDITION_2024" },
      include: { variants: true },
    });
    const redVariant = dragonborn.variants.find((v) => v.slug === "red")!;
    const res = await post({
      ...baseBody,
      speciesId: dragonborn.id,
      variantId: redVariant.id,
      castingAbility: "wisdom",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("castingAbility not allowed: this species/variant grants no spells");
  });

  it("a species-level (variantless) grant would require castingAbility too — verified via High Elf, a variant-level grant", async () => {
    const elf = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2024" },
      include: { variants: true },
    });
    const highElf = elf.variants.find((v) => v.slug === "high")!;
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: highElf.id,
      castingAbility: "intelligence",
      speciesSkills: ["survival"],
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.castingAbility).toBe("intelligence");
  });

  it("a 2014 character never carries a castingAbility (no 2014 row grants a spell this slice)", async () => {
    // Human (2014) has no variants, so no variantId is needed — isolates this test to the castingAbility question alone.
    const human2014 = await prisma.species.findFirstOrThrow({ where: { slug: "human", edition: "EDITION_2014" } });
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: human2014.id,
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.castingAbility).toBeNull();
  });
});

// High Elf's Cantrip pins its ability (Intelligence) in the chooseCantrip spec — a submitted castingAbility is rejected with a message distinct from "grants no spells", while the cantrip still resolves Intelligence-keyed unsubmitted (#1756).
describe("POST /api/characters — 2014 High Elf's fixed-ability cantrip (#1756)", () => {
  async function highElf2014() {
    const elf = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    return { elf, highElfVariant: elf.variants.find((v) => v.slug === "high")! };
  }

  it("400s a submitted castingAbility with a fixed-ability message distinct from the no-spells case", async () => {
    const { elf, highElfVariant } = await highElf2014();
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2014" } });
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: elf.id,
      variantId: highElfVariant.id,
      speciesCantripId: fireBolt.id,
      castingAbility: "wisdom",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("castingAbility not allowed: this species/variant's spellcasting ability is fixed");
  });

  it("201s without a castingAbility and keys the granted cantrip off the spec's fixed Intelligence", async () => {
    const { elf, highElfVariant } = await highElf2014();
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2014" } });
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: elf.id,
      variantId: highElfVariant.id,
      speciesCantripId: fireBolt.id,
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    const entry = (res.body.spellcasting.spells as Record<string, unknown>[]).find((s) => s.name === "Fire Bolt");
    expect(entry!.source).toBe("species");
    expect(entry!.castingAbility).toBe("intelligence");
    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesCantripName).toBe("Fire Bolt");
  });
});
