// End-to-end proof against the REAL seeded background content (#1565): a
// background's own StartingEquipmentPackage resolves by (backgroundId,
// edition) exactly like a class's does, and its GP ADDS to the class
// package's GP rather than overwriting it. Modelled directly on
// starting-equipment-2024-content.test.ts's shape (real seeded rows, never a
// fixture class/background).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

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

function baseBody(overrides: Record<string, unknown>) {
  return {
    name: "Fixture",
    alignment: "True Neutral",
    race: "Human",
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
        baseBody({
          name: "2024 Criminal Fighter",
          background: "Criminal",
          classes: [{ name: "Fighter" }],
          rulesEdition: "EDITION_2024",
          // Fighter 2024 option A: Chain Mail, Greatsword, Flail, 8 Javelins,
          // Dungeoneer's Pack, 4 GP.
          startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
          // Criminal 2024 option A: 2 Daggers, Thieves' Tools, Crowbar, 2
          // Pouches, Traveler's Clothes, 16 GP.
          backgroundStartingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] },
        }),
      );

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const inventory: { name: string; quantity: number }[] = response.body.inventory;
    // Class package items.
    expect(inventory.find((i) => i.name === "Greatsword")).toBeDefined();
    expect(inventory.find((i) => i.name === "Javelin")?.quantity).toBe(8);
    // Background package items.
    expect(inventory.find((i) => i.name === "Dagger")?.quantity).toBe(2);
    expect(inventory.find((i) => i.name === "Thieves' Tools")).toBeDefined();
    expect(inventory.find((i) => i.name === "Crowbar")).toBeDefined();
    expect(inventory.find((i) => i.name === "Pouch")?.quantity).toBe(2);
    expect(inventory.find((i) => i.name === "Traveler's Clothes")).toBeDefined();
    // The acceptance criterion most likely to be quietly wrong: 4 + 16 = 20,
    // never one silently overwriting the other.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 20, pp: 0 });
  });

  it("choosing option B (flat GP) on both sums 155 (Fighter) + 50 (Criminal) = 205 GP with no items", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
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
        baseBody({
          name: "2014 Acolyte",
          background: "Acolyte",
          classes: [{ name: "Cleric" }],
          rulesEdition: "EDITION_2014",
          // Cleric 2014 has 5 groups; the last (shield + holy symbol) is
          // auto-granted. Pick mace/scale mail/simple-weapon-crossbow/priest's-pack.
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
    // 2024's items (Calligrapher's Supplies, Book of Lore, Parchment, Robe)
    // must NOT appear — proves this resolved the 2014 row, not the 2024 one.
    expect(inventory.find((i) => i.name === "Calligrapher's Supplies")).toBeUndefined();
    expect(inventory.find((i) => i.name === "Book of Lore")).toBeUndefined();
    // Cleric 2014's own package carries 0 GP on every option (dice-roll mode
    // untouched) — Acolyte's 15 GP is the only GP this character has.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  it("a 2024 Acolyte of the SAME background gets SRD 5.2's option-A items and 8 GP — unaffected by #1565's 2014 row", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "2024 Acolyte",
          background: "Acolyte",
          classes: [{ name: "Cleric" }],
          rulesEdition: "EDITION_2024",
          // Cleric 2024 is one group, option A (items) chosen.
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
    // 2014's items must NOT appear.
    expect(inventory.find((i) => i.name === "Prayer Book")).toBeUndefined();
    expect(inventory.find((i) => i.name === "Common Clothes")).toBeUndefined();
    // Cleric 2024 option A (Chain Shirt/Shield/Mace/Holy Symbol/Priest's Pack)
    // carries 7 GP + Acolyte's 8 GP = 15.
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
  });

  // Mutation proof (this PR's report carries the full red output):
  // temporarily hardcoding loadBackgroundEquipmentDef's edition argument to
  // always "EDITION_2014" turns the 2024 Acolyte test above red (it would
  // then assert the 2014 fixed-list items and 15+7=22 GP instead) while the
  // 2014 Acolyte test stays green — proving this suite genuinely depends on
  // per-edition resolution, not a coincidence.
});

describe("a background with no package still creates successfully (#1565)", () => {
  // 2014 Charlatan. This fixture has now moved twice for the same reason: it
  // must be a background that RESOLVES under the character's edition and simply
  // has no package, or it silently exercises the unknown-name path instead.
  // Charlatan was wrong once #1570 gave it a 2024 package; Folk Hero was wrong
  // once #1570 tagged it EDITION_2014 (a 2024 character's "Folk Hero" stops
  // resolving and becomes homebrew). SRD 5.1 ships only Acolyte, so every 2014
  // background but that one is a valid choice here.
  it("2014 Charlatan (resolves, but SRD 5.1 gives it no package) creates fine with no backgroundStartingEquipment sent", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
          name: "Charlatan No Equipment",
          background: "Charlatan",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
        }),
      );
    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.inventory).toEqual([]);
    // Distinguishes this from the homebrew path below: the name really did
    // resolve to a catalog row, so "no package" is the branch under test.
    expect(response.body.background).toBe("Charlatan");
  });

  it("sending backgroundStartingEquipment for a background with no package 400s", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
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
        baseBody({
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

// #1570: the first 2014 background package with an open pick, and the first
// UNBOUND tool pick anywhere — Soldier's and Noble's gaming sets are bound to a
// proficiency the background grants, but PHB'14 Folk Hero grants no tool
// proficiency at all, so a bound pick here would have nothing to offer. No class
// equipment is sent, so the inventory and GP below are the background's alone.
describe("PHB'14 Folk Hero background package (#1570)", () => {
  it("a 2014 Folk Hero gets the fixed list, 10 GP, and whichever artisan's tools they picked", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        baseBody({
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
        baseBody({
          name: "Folk Hero Bad Pick",
          background: "Folk Hero",
          classes: [{ name: "Rogue" }],
          rulesEdition: "EDITION_2014",
          // A musical instrument: in the catalog, carries a toolCategory, and
          // would pass a filter that merely checked "is a tool".
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
        baseBody({
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
    // The 2014 package must not leak across the edition boundary: creation is
    // refused rather than quietly handing a 2024 character PHB'14 gear.
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
        baseBody({
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
