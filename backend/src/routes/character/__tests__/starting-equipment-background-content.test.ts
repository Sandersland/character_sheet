// A background's own StartingEquipmentPackage resolves by (backgroundId, edition) exactly like a class's does, and its GP adds to the class package's GP rather than overwriting it (#1565).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-starting-equipment-background-content";
let COOKIE: string;
const createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

afterAll(async () => {
  const { prisma } = await import("@/lib/core/prisma.js");
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
});

async function baseBody(overrides: { rulesEdition: "EDITION_2014" | "EDITION_2024" } & Record<string, unknown>) {
  const anchor = await seededSpeciesAnchor(overrides.rulesEdition);
  return {
    name: "Fixture",
    alignment: "True Neutral",
    ...anchor,
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

describe("real background starting-equipment gold ADDS to the class package's gold (#1565)", () => {
  it("a 2024 Criminal Fighter picking option A on both gets 4 + 16 = 20 GP, and both item sets land", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2024 Criminal Fighter",
          background: "Criminal",
          classes: [{ name: "Fighter" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Greatsword")).toBeDefined();
    expect(inventory.find((i) => i.name === "Javelin")?.quantity).toBe(8);
    expect(inventory.find((i) => i.name === "Dagger")?.quantity).toBe(2);
    expect(inventory.find((i) => i.name === "Thieves' Tools")).toBeDefined();
    expect(inventory.find((i) => i.name === "Crowbar")).toBeDefined();
    expect(inventory.find((i) => i.name === "Pouch")?.quantity).toBe(2);
    expect(inventory.find((i) => i.name === "Traveler's Clothes")).toBeDefined();
    // The acceptance criterion most likely to be quietly wrong: 4 + 16 = 20, never one silently overwriting the other.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 20, pp: 0 });
  });

  it("choosing option B (flat GP) on both sums 155 (Fighter) + 50 (Criminal) = 205 GP with no items", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2024 Criminal Fighter Gold-Only",
          background: "Criminal",
          classes: [{ name: "Fighter" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 2 }] },
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 1 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.inventory).toEqual([]);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 205, pp: 0 });
  });
});

describe("real Acolyte background package resolves per-edition, never one serving both (#1565)", () => {
  it("a 2014 Acolyte gets SRD 5.1's fixed list and 15 GP", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2014 Acolyte",
          background: "Acolyte",
          classes: [{ name: "Cleric" }],
          rulesEdition: "EDITION_2014",
          startingEquipment: {
            mode: "package",
            selections: [{ optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }, { optionIndex: 0 }],
          },
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Prayer Book")).toBeDefined();
    expect(inventory.find((i) => i.name === "Incense Block")?.quantity).toBe(5);
    expect(inventory.find((i) => i.name === "Vestments")).toBeDefined();
    expect(inventory.find((i) => i.name === "Common Clothes")).toBeDefined();
    // 2024's items must NOT appear — proves this resolved the 2014 row, not the 2024 one.
    expect(inventory.find((i) => i.name === "Calligrapher's Supplies")).toBeUndefined();
    expect(inventory.find((i) => i.name === "Book of Lore")).toBeUndefined();
    // Cleric 2014's own package carries 0 GP on every option — Acolyte's 15 GP is the only GP this character has.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  it("a 2024 Acolyte of the SAME background gets SRD 5.2's option-A items and 8 GP — unaffected by #1565's 2014 row", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2024 Acolyte",
          background: "Acolyte",
          classes: [{ name: "Cleric" }],
          rulesEdition: "EDITION_2024",
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Calligrapher's Supplies")).toBeDefined();
    expect(inventory.find((i) => i.name === "Book of Lore")).toBeDefined();
    expect(inventory.find((i) => i.name === "Parchment Sheet")?.quantity).toBe(10);
    expect(inventory.find((i) => i.name === "Robe")).toBeDefined();
    expect(inventory.find((i) => i.name === "Prayer Book")).toBeUndefined();
    expect(inventory.find((i) => i.name === "Common Clothes")).toBeUndefined();
    // Cleric 2024 option A carries 7 GP + Acolyte's 8 GP = 15.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  // Mutation proof: hardcoding loadBackgroundEquipmentDef's edition argument to always "EDITION_2014" turns the 2024 Acolyte test above red, proving this suite genuinely depends on per-edition resolution.
});

describe("a background with no package still creates successfully (#1565)", () => {
  // Must be a background that resolves under the character's edition and simply has no package, or this silently exercises the unknown-name path instead.
  it("2014 Charlatan (resolves, but SRD 5.1 gives it no package) creates fine with no backgroundStartingEquipment sent", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "Charlatan No Equipment",
          background: "Charlatan",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
        }),
      );
    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.inventory).toEqual([]);
    // Distinguishes this from the homebrew path below: the name really did resolve to a catalog row, so "no package" is the branch under test.
    expect(response.body.background).toBe("Charlatan");
  });

  it("sending backgroundStartingEquipment for a background with no package 400s", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "Charlatan Rejected",
          background: "Charlatan",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/No starting equipment package defined for background/);
  });

  it("a homebrew background name creates fine with no backgroundStartingEquipment sent", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "Homebrew Background",
          background: "A Wandering Tinker I Invented",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2024",
        }),
      );
    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.inventory).toEqual([]);
  });
});

// PHB'14 Folk Hero grants no tool proficiency at all, unlike Soldier's/Noble's gaming sets (bound to a proficiency the background grants) — so this pick is unbound (#1570).
describe("PHB'14 Folk Hero background package (#1570)", () => {
  it("a 2014 Folk Hero gets the fixed list, 10 GP, and whichever artisan's tools they picked", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2014 Folk Hero",
          background: "Folk Hero",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
          backgroundStartingEquipment: {
            mode: "package",
            selections: [{ optionIndex: 0, openPicks: ["Smith's Tools"] }],
          },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    expect(inventory.find((i) => i.name === "Shovel")).toBeDefined();
    expect(inventory.find((i) => i.name === "Iron Pot")).toBeDefined();
    expect(inventory.find((i) => i.name === "Common Clothes")).toBeDefined();
    expect(inventory.find((i) => i.name === "Smith's Tools")).toBeDefined();
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });
  });

  it("rejects an open pick that isn't an artisan's tool, even though it is a real tool", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "Folk Hero Bad Pick",
          background: "Folk Hero",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
          // A musical instrument carries a toolCategory too, and would pass a filter that merely checked "is a tool".
          backgroundStartingEquipment: {
            mode: "package",
            selections: [{ optionIndex: 0, openPicks: ["Lute"] }],
          },
        }),
      );
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/toolCategory must be "artisan"/);
  });

  it("is not offered to a 2024 character at all — the name falls through to homebrew", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "2024 Folk Hero Attempt",
          background: "Folk Hero",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2024",
          backgroundStartingEquipment: {
            mode: "package",
            selections: [{ optionIndex: 0, openPicks: ["Smith's Tools"] }],
          },
        }),
      );
    // The 2014 package must not leak across the edition boundary: creation is refused, not quietly handed 2024's PHB'14 gear.
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/No starting equipment package defined for background/);
  });
});

describe("backgroundStartingEquipment rejects mode:\"gold\" (#1565)", () => {
  it("a background never has a roll-for-gold alternative, in either edition", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          name: "Gold Mode Rejected",
          background: "Acolyte",
          classes: [{ name: "Cleric" }],
          rulesEdition: "EDITION_2024",
          backgroundStartingEquipment: { mode: "gold", gold: 10 },
        }),
      );
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no roll-for-gold alternative/i);
  });
});
