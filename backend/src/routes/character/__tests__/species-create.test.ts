// POST /api/characters — speciesId is the SOLE mechanical anchor since #1684
// pruned the flat `Race` model and the legacy `race`-name create path.
// Exercises the seeded catalog directly (real Species/SpeciesVariant rows
// from seedSpecies) rather than a fixture — same pattern as the background
// ability spread suite in characters.test.ts, which relies on the seeded
// Criminal background.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-species-create";
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

const baseBody = {
  name: "Species Tester",
  alignment: "True Neutral",
  background: "Acolyte",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 12, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
};

describe("POST /api/characters — speciesId/variantId is the sole anchor (#1684)", () => {
  it("persists the speciesId/variantId selection + variantName snapshot", async () => {
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

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesId).toBe(dwarf.id);
    expect(raceRow.variantId).toBe(hillDwarf.id);
    expect(raceRow.variantName).toBe("Hill Dwarf");
    // #1684: the display-name snapshot defaults from the variant, replacing
    // the flat Race model's own separately-submitted `name`.
    expect(raceRow.name).toBe("Hill Dwarf");
  });

  // The compat-gap fix (#1684's whole point): Aasimar never had a flat Race
  // row (the legacy `race`-name path could never create one), so this proves
  // creation now succeeds for a species the pre-#1684 create path could not
  // serve at all.
  it("creates a 2024-only species with no former flat Race row (Aasimar) — the compat-gap fix", async () => {
    const aasimar = await prisma.species.findFirstOrThrow({ where: { slug: "aasimar", edition: "EDITION_2024" } });

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: aasimar.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    expect(res.body.race).toBe("Aasimar");

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesId).toBe(aasimar.id);
    expect(raceRow.variantId).toBeNull();
    expect(raceRow.name).toBe("Aasimar");
  });

  it("400s with no speciesId at all — the field is required, not optional", async () => {
    const res = await post({ ...baseBody, rulesEdition: "EDITION_2024" });
    expect(res.status).toBe(400);
  });

  it("400s a cross-edition species (2014 Dwarf id on a 2024 character)", async () => {
    const dwarf2014 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: dwarf2014.id,
    });

    expect(res.status).toBe(400);
  });

  it("400s a variantId on a variantless species (2024 Human)", async () => {
    const human2024 = await prisma.species.findFirstOrThrow({ where: { slug: "human", edition: "EDITION_2024" } });
    const someVariant = await prisma.speciesVariant.findFirstOrThrow({});

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: human2024.id,
      variantId: someVariant.id,
    });

    expect(res.status).toBe(400);
  });

  it("400s a variant-bearing species with no variantId (2014 Dwarf, no variant chosen)", async () => {
    const dwarf2014 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: dwarf2014.id,
    });

    expect(res.status).toBe(400);
  });

  it("400s a variantId belonging to a different species", async () => {
    const dwarf2014 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" } });
    const elf2014 = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const woodElf = elf2014.variants.find((v) => v.slug === "wood")!;

    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2014",
      speciesId: dwarf2014.id,
      variantId: woodElf.id, // belongs to Elf, not Dwarf
    });

    expect(res.status).toBe(400);
  });

  it("400s a variantId supplied without a speciesId", async () => {
    const someVariant = await prisma.speciesVariant.findFirstOrThrow({});
    const res = await post({ ...baseBody, variantId: someVariant.id });
    expect(res.status).toBe(400);
  });

  it("400s an unknown speciesId", async () => {
    const res = await post({ ...baseBody, rulesEdition: "EDITION_2024", speciesId: "not-a-real-id" });
    expect(res.status).toBe(400);
  });
});
