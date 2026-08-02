// End-to-end proof against the REAL seeded content (#1535, not a fixture
// class): a 2024 character offers and grants the genuine PHB'24 package —
// items AND its option's GP landing in currency — while a 2014 character of
// the same class still gets PHB'14's, unaffected. Barbarian is the simplest
// class (one option with no open picks) for the edition-resolution + gold
// proof; Bard/Monk cover the two real non-weapon open picks #1535 lands
// (starting-equipment-tool-picks.test.ts already proves the underlying
// filter/bound-choice branches in isolation against a fixture class — this
// file proves the real seeded rows actually carry that shape).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-starting-equipment-2024-content";
let COOKIE: string;
const createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

afterAll(async () => {
  const { prisma } = await import("@/lib/core/prisma.js");
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
});

function baseBody(overrides: Record<string, unknown>) {
  return {
    name: "Fixture",
    alignment: "True Neutral",
    race: "Human",
    background: "Soldier",
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    skillProficiencies: [] as string[],
    ...overrides,
  };
}

describe("real EDITION_2024 Barbarian package vs. real EDITION_2014 (#1535)", () => {
  it("a 2024 Barbarian gets the PHB'24 package: Greataxe, 4 Handaxes, Explorer's Pack, and its option's 15 GP in currency", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Barbarian",
          classes: [{ name: "Barbarian" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Greataxe")).toBeDefined();
    expect(inventory.find((i) => i.name === "Handaxe")?.quantity).toBe(4);
    // Explorer's Pack expands via PACK_CONTENTS — its own name never lands.
    expect(inventory.find((i) => i.name === "Explorer's Pack")).toBeUndefined();
    expect(inventory.find((i) => i.name === "Backpack")).toBeDefined();
    // 2014's Barbarian package has no Handaxe/Explorer's-Pack GP at all (0);
    // 15 only exists on the 2024 option, so a nonzero-15 match is edition-specific.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  it("a 2014 Barbarian of the SAME class still gets PHB'14's shape (3 groups, 0 gold) — unaffected by #1535", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2014 Barbarian",
          classes: [{ name: "Barbarian" }],
          rulesEdition: "EDITION_2014",
          startingEquipment: {
            mode: "package",
            selections: [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }],
          },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Greataxe")).toBeDefined();
    expect(inventory.find((i) => i.name === "Javelin")?.quantity).toBe(4);
    // Every EDITION_2014 option carries gold: 0 — no 15 GP surprise from the
    // sibling 2024 row.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
  });

  // Mutation proof (see this PR's report for the full red output): hardcoding
  // loadClassEquipmentDef's (classId, edition) lookup to always resolve
  // EDITION_2014 (character-create.ts) turns 3 of this file's 4 tests red —
  // the 2024 Barbarian test above (its Greataxe/15-GP option no longer
  // exists on the 2014 row) plus both open-pick tests below (Bard/Monk's
  // 2014 packages have a different group count, so `selections` no longer
  // matches). Only the 2014 Barbarian test above stays green, proving this
  // suite genuinely depends on per-edition resolution rather than a
  // coincidence.
});

describe("real EDITION_2024 Bard package: the musical-instrument open pick (#1535)", () => {
  it("accepts an instrument (Flute) and rejects a weapon (Dagger) for the same pick", async () => {
    const ok = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Bard OK",
          classes: [{ name: "Bard" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0, openPicks: ["Flute"] }] },
        }),
      );
    expect(ok.status).toBe(201);
    createdCharacterIds.push(ok.body.id);
    const names: string[] = ok.body.inventory.map((i: { name: string }) => i.name);
    expect(names).toContain("Flute");

    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Bard Rejected",
          classes: [{ name: "Bard" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0, openPicks: ["Dagger"] }] },
        }),
      );
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/toolCategory/i);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });
});

describe("real EDITION_2024 Monk package: the tool-bound open pick (#1535)", () => {
  it("accepts the tool the character chose at creation and rejects one they didn't", async () => {
    const ok = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Monk OK",
          classes: [{ name: "Monk" }],
          rulesEdition: "EDITION_2024",
          toolChoices: ["Flute"],
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0, openPicks: ["Flute"] }] },
        }),
      );
    expect(ok.status).toBe(201);
    createdCharacterIds.push(ok.body.id);
    const names: string[] = ok.body.inventory.map((i: { name: string }) => i.name);
    expect(names).toContain("Flute");

    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Monk Rejected",
          classes: [{ name: "Monk" }],
          rulesEdition: "EDITION_2024",
          toolChoices: ["Flute"],
          // Chose Flute proficiency, but tries to take the Drum for the bound pick.
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0, openPicks: ["Drum"] }] },
        }),
      );
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/chosen tool proficiencies/i);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });
});
