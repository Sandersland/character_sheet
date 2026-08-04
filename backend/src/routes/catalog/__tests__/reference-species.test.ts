// GET /api/reference serves `species` nested per edition (#1679), alongside
// the existing flat `races` (which stays untouched — the legacy path is
// pruned only in #1684). Own file rather than appending to reference.test.ts:
// this is a self-contained new field, not a change to any existing assertion.
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-reference-species";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

async function getReference(edition: "EDITION_2014" | "EDITION_2024") {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/reference?edition=${edition}`);
}

describe("GET /api/reference — species (#1679)", () => {
  it("serves species alongside the existing flat races list", async () => {
    const response = await getReference("EDITION_2024");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("races");
    expect(response.body).toHaveProperty("species");
    expect(Array.isArray(response.body.species)).toBe(true);
  });

  it("2014 species roster excludes 2024 exclusives and vice versa", async () => {
    const res2014 = await getReference("EDITION_2014");
    const res2024 = await getReference("EDITION_2024");

    const names2014 = res2014.body.species.map((s: { name: string }) => s.name);
    const names2024 = res2024.body.species.map((s: { name: string }) => s.name);

    expect(names2014).not.toEqual(expect.arrayContaining(["Aasimar", "Goliath", "Orc"]));
    expect(names2024).not.toEqual(expect.arrayContaining(["Half-Elf", "Half-Orc"]));
    expect(names2014).toEqual(expect.arrayContaining(["Dwarf", "Elf", "Halfling", "Human", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"]));
    expect(names2024).toEqual(expect.arrayContaining(["Aasimar", "Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling"]));
  });

  it("canary: Dwarf speed differs by edition (25 ft 2014 / 30 ft 2024)", async () => {
    const res2014 = await getReference("EDITION_2014");
    const res2024 = await getReference("EDITION_2024");

    const dwarf2014 = res2014.body.species.find((s: { name: string }) => s.name === "Dwarf");
    const dwarf2024 = res2024.body.species.find((s: { name: string }) => s.name === "Dwarf");

    expect(dwarf2014.speed).toBe(25);
    expect(dwarf2024.speed).toBe(30);
  });

  it("nests variants inside each species, like classes[].subclasses", async () => {
    const response = await getReference("EDITION_2014");
    const dwarf = response.body.species.find((s: { name: string }) => s.name === "Dwarf");

    expect(Array.isArray(dwarf.variants)).toBe(true);
    expect(dwarf.variants.map((v: { name: string }) => v.name).sort()).toEqual(["Hill Dwarf", "Mountain Dwarf"]);
    expect(dwarf.variants[0]).toHaveProperty("id");
    expect(dwarf.variants[0]).toHaveProperty("slug");
  });

  it("serves an empty variants array for a variantless species (2024 Dwarf)", async () => {
    const response = await getReference("EDITION_2024");
    const dwarf = response.body.species.find((s: { name: string }) => s.name === "Dwarf");
    expect(dwarf.variants).toEqual([]);
  });

  it("serves abilityIncreases on species AND variants (#1681) — [] for every 2024 row", async () => {
    const res2014 = await getReference("EDITION_2014");
    const dwarf2014 = res2014.body.species.find((s: { name: string }) => s.name === "Dwarf");
    expect(dwarf2014.abilityIncreases).toEqual([{ ability: "constitution", amount: 2 }]);
    const hillDwarf = dwarf2014.variants.find((v: { name: string }) => v.name === "Hill Dwarf");
    expect(hillDwarf.abilityIncreases).toEqual([{ ability: "wisdom", amount: 1 }]);

    const res2024 = await getReference("EDITION_2024");
    const dwarf2024 = res2024.body.species.find((s: { name: string }) => s.name === "Dwarf");
    expect(dwarf2024.abilityIncreases).toEqual([]);
  });

  it("Dragonborn carries its 10 draconic ancestry variants in both editions", async () => {
    const res2014 = await getReference("EDITION_2014");
    const res2024 = await getReference("EDITION_2024");

    const dragonborn2014 = res2014.body.species.find((s: { name: string }) => s.name === "Dragonborn");
    const dragonborn2024 = res2024.body.species.find((s: { name: string }) => s.name === "Dragonborn");

    expect(dragonborn2014.variants).toHaveLength(10);
    expect(dragonborn2024.variants).toHaveLength(10);
  });
});

describe("GET /api/reference — species creation-choice specs (#1689)", () => {
  it("Half-Elf's own row serves chooseSkills (count 2, no `from` restriction); chooseCantrip is null", async () => {
    const res = await getReference("EDITION_2014");
    const halfElf = res.body.species.find((s: { name: string }) => s.name === "Half-Elf");
    expect(halfElf.chooseSkills).toEqual({ count: 2 });
    expect(halfElf.chooseCantrip).toBeNull();
  });

  it("High Elf's own VARIANT row serves chooseCantrip (wizard list, Intelligence); the parent Elf row and every other Elf variant serve null for both", async () => {
    const res = await getReference("EDITION_2014");
    const elf = res.body.species.find((s: { name: string }) => s.name === "Elf");
    expect(elf.chooseSkills).toBeNull();
    expect(elf.chooseCantrip).toBeNull();

    const highElf = elf.variants.find((v: { name: string }) => v.name === "High Elf");
    expect(highElf.chooseCantrip).toEqual({ list: "wizard", castingAbility: "intelligence" });
    expect(highElf.chooseSkills).toBeNull();

    const woodElf = elf.variants.find((v: { name: string }) => v.name === "Wood Elf");
    expect(woodElf.chooseSkills).toBeNull();
    expect(woodElf.chooseCantrip).toBeNull();
  });

  it("a species/variant with no choice-bearing trait (Hill Dwarf) serves null for both fields", async () => {
    const res = await getReference("EDITION_2014");
    const dwarf = res.body.species.find((s: { name: string }) => s.name === "Dwarf");
    expect(dwarf.chooseSkills).toBeNull();
    expect(dwarf.chooseCantrip).toBeNull();
    const hillDwarf = dwarf.variants.find((v: { name: string }) => v.name === "Hill Dwarf");
    expect(hillDwarf.chooseSkills).toBeNull();
    expect(hillDwarf.chooseCantrip).toBeNull();
  });

  it("every 2024 species but Human/Elf serves null chooseSkills and false chooseOriginFeat — no other 2024 choice content this slice (#1690's)", async () => {
    const res = await getReference("EDITION_2024");
    const rows = res.body.species as {
      name: string;
      chooseSkills: unknown;
      chooseCantrip: unknown;
      chooseOriginFeat: boolean;
      variants: { chooseSkills: unknown; chooseCantrip: unknown; chooseOriginFeat: boolean }[];
    }[];
    for (const species of rows) {
      expect(species.chooseCantrip).toBeNull();
      for (const variant of species.variants) {
        expect(variant.chooseSkills).toBeNull();
        expect(variant.chooseCantrip).toBeNull();
        expect(variant.chooseOriginFeat).toBe(false);
      }
      if (species.name === "Human") {
        expect(species.chooseSkills).toEqual({ count: 1 });
        expect(species.chooseOriginFeat).toBe(true);
      } else if (species.name === "Elf") {
        expect(species.chooseSkills).toEqual({ count: 1, from: ["insight", "perception", "survival"] });
        expect(species.chooseOriginFeat).toBe(false);
      } else {
        expect(species.chooseSkills).toBeNull();
        expect(species.chooseOriginFeat).toBe(false);
      }
    }
  });
});

describe("GET /api/reference — species creation-choice specs, chooseOriginFeat (#1690)", () => {
  it("2014 species all serve chooseOriginFeat: false — the spec is 2024-only content this wave", async () => {
    const res = await getReference("EDITION_2014");
    for (const species of res.body.species as { chooseOriginFeat: boolean; variants: { chooseOriginFeat: boolean }[] }[]) {
      expect(species.chooseOriginFeat).toBe(false);
      for (const variant of species.variants) expect(variant.chooseOriginFeat).toBe(false);
    }
  });
});
