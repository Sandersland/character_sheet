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
