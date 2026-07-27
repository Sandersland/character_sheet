/**
 * #1345: a client-supplied catalog id must not resolve against the OTHER
 * edition's row. Covers all seven sites the plan audit found (the issue named
 * three) — grouped by chunk below. Modelled on rules-edition-seam.test.ts:
 * real Postgres, characters built over HTTP with explicit rulesEdition.
 *
 * Fixture rows are built through upsertEditionRow (compound keys containing
 * `edition` reject a literal null on findUnique/upsert — catalog-edition.ts).
 * afterAll deletes fixtures by NAME, never by an id/classId var that could be
 * undefined if beforeAll threw partway (an undefined classId reads to Prisma
 * as "no filter" and would delete the real catalog).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const OWNER_ID = "owner-cross-edition-catalog-id";
let COOKIE: string;
const app = createApp();

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

describe("Chunk 1 — Feat / advancement.takeFeat (lib/leveling/advancement.ts:353)", () => {
  // The seeded Alert fork (#1306's worked example) is unusable here: both rows
  // are category "origin", rejected by featOfferedForAsiSlot BEFORE the guard
  // runs — a naive test against Alert would pass for the wrong reason. This
  // trio is "general" category, reachable through the ASI slot at level 4.
  const FEAT_2014 = "XEd General 2014";
  const FEAT_2024 = "XEd General 2024";
  const FEAT_SHARED = "XEd General Shared";
  let featId2014: string;
  let featId2024: string;
  let featIdShared: string;

  beforeAll(async () => {
    const mk = (name: string, edition: "EDITION_2014" | "EDITION_2024" | null) =>
      upsertEditionRow(
        prisma.feat,
        { name, edition },
        {
          name,
          edition,
          category: "general",
          description: "Cross-edition guard test fixture.",
          levelPrerequisite: 4,
          abilityOptions: [],
          abilityIncrease: 1,
          improvements: [],
        },
        { category: "general", levelPrerequisite: 4 },
      );
    [featId2014, featId2024, featIdShared] = await Promise.all([
      mk(FEAT_2014, "EDITION_2014"),
      mk(FEAT_2024, "EDITION_2024"),
      mk(FEAT_SHARED, null),
    ]).then((rows) => rows.map((r) => r.id));
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "XEd Advancement" } } });
    await prisma.feat.deleteMany({ where: { name: { in: [FEAT_2014, FEAT_2024, FEAT_SHARED] } } });
  });

  // Level 4 (XP 2700) → one ASI slot (advancement.test.ts:20 convention).
  async function createCharacter(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string) {
    const res = await agent()
      .post("/api/characters")
      .send({
        name,
        alignment: "True Neutral",
        race: "Hill Dwarf",
        background: "Sage",
        classes: [{ name: "Fighter" }],
        abilityScores: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
        rulesEdition,
        experiencePoints: 2700,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function takeFeat(characterId: string, featId: string) {
    return agent()
      .post(`/api/characters/${characterId}/advancement/transactions`)
      .send({ operations: [{ type: "takeFeat", featId }] });
  }

  it("(AC) rejects a 2014-tagged feat for a 2024 character with a 400 naming both editions", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Advancement 2024a");
    const res = await takeFeat(id, featId2014);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });

  it("(symmetry) rejects a 2024-tagged feat for a 2014 character", async () => {
    const id = await createCharacter("EDITION_2014", "XEd Advancement 2014a");
    const res = await takeFeat(id, featId2024);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });

  it("(NULL-row AC) accepts the shared feat for a 2024 character", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Advancement 2024b");
    const res = await takeFeat(id, featIdShared);
    expect(res.status).toBe(200);
  });

  it("(NULL-row AC) accepts the shared feat for a 2014 character", async () => {
    const id = await createCharacter("EDITION_2014", "XEd Advancement 2014b");
    const res = await takeFeat(id, featIdShared);
    expect(res.status).toBe(200);
  });

  it("(unchanged) accepts a same-edition feat", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Advancement 2024c");
    const res = await takeFeat(id, featId2024);
    expect(res.status).toBe(200);
  });
});

describe("Chunk 2 — Subclass / class.setSubclass (lib/classes/class.ts:83)", () => {
  const CLASS_NAME = "XEd Fighter";
  const SUB_2014 = "XEd Sub 2014";
  const SUB_2024 = "XEd Sub 2024";
  const SUB_SHARED = "XEd Sub Shared";
  let classId: string;
  let subId2014: string;
  let subId2024: string;
  let subIdShared: string;

  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: {
        name: CLASS_NAME,
        hitDie: "d10",
        subclassLevel: 3,
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
      },
      update: { subclassLevel: 3 },
    });
    classId = cls.id;

    const mk = (name: string, edition: "EDITION_2014" | "EDITION_2024" | null, slug: string) =>
      upsertEditionRow(
        prisma.subclass,
        { classId, name, edition },
        { classId, name, edition, description: "Cross-edition guard test fixture.", slug },
        {},
      );
    [subId2014, subId2024, subIdShared] = await Promise.all([
      mk(SUB_2014, "EDITION_2014", "xed-sub-2014"),
      mk(SUB_2024, "EDITION_2024", "xed-sub-2024"),
      mk(SUB_SHARED, null, "xed-sub-shared"),
    ]).then((rows) => rows.map((r) => r.id));
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "XEd Class" } } });
    await prisma.subclass.deleteMany({ where: { name: { in: [SUB_2014, SUB_2024, SUB_SHARED] } } });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  // Level 3+ (XP 900, hitDice.total 3) so subclassGateLevel passes for both editions.
  async function createCharacter(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string) {
    const res = await agent()
      .post("/api/characters")
      .send({
        name,
        alignment: "True Neutral",
        race: "Hill Dwarf",
        background: "Sage",
        classes: [{ name: CLASS_NAME }],
        abilityScores: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
        rulesEdition,
        experiencePoints: 900,
      });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level: 3 } });
    await prisma.character.update({ where: { id }, data: { hitDice: { total: 3, die: "d10" } } });
    return id;
  }

  async function setSubclass(characterId: string, subclassId: string) {
    return agent()
      .post(`/api/characters/${characterId}/class/transactions`)
      .send({ operations: [{ type: "setSubclass", subclassId }] });
  }

  it("(AC) rejects a 2014-tagged subclass for a 2024 character", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Class 2024a");
    const res = await setSubclass(id, subId2014);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });

  it("(NULL-row AC) accepts the shared subclass for a 2024 character", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Class 2024b");
    const res = await setSubclass(id, subIdShared);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].subclass).toBe(SUB_SHARED);
  });

  it("(NULL-row AC) accepts the shared subclass for a 2014 character", async () => {
    const id = await createCharacter("EDITION_2014", "XEd Class 2014a");
    const res = await setSubclass(id, subIdShared);
    expect(res.status).toBe(200);
  });

  it("(unchanged) accepts a same-edition subclass", async () => {
    const id = await createCharacter("EDITION_2024", "XEd Class 2024c");
    const res = await setSubclass(id, subId2024);
    expect(res.status).toBe(200);
  });
});

describe("Chunk 3 — Subclass / character-create.resolveSubclass (lib/character/character-create.ts:167)", () => {
  const CLASS_NAME = "XEd Cleric";
  const SUB_2014 = "XEd Domain 2014";
  const SUB_2024 = "XEd Domain 2024";
  const SUB_SHARED = "XEd Domain Shared";
  let classId: string;
  let subId2014: string;
  let subId2024: string;
  let subIdShared: string;

  beforeAll(async () => {
    // subclassLevel 1: subclassGateLevel(_, "EDITION_2024") returns 3
    // UNCONDITIONALLY (effective-levels.ts), so ANY 2024 character 400s at
    // the pre-existing gate check regardless of this guard — a 2024 fixture
    // here would pass for the wrong reason. Only a 2014 character reaches
    // creation-time subclass resolution at all (gate 1), so the cross-edition
    // test below must use one, and must assert on the edition wording
    // specifically (not just status 400) or it can't be told apart from the
    // gate rejection.
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: {
        name: CLASS_NAME,
        hitDie: "d8",
        subclassLevel: 1,
        savingThrows: ["wisdom", "charisma"],
        skillChoiceCount: 2,
        skillChoices: ["insight", "religion"],
        isSpellcaster: true,
      },
      update: { subclassLevel: 1 },
    });
    classId = cls.id;

    const mk = (name: string, edition: "EDITION_2014" | "EDITION_2024" | null, slug: string) =>
      upsertEditionRow(
        prisma.subclass,
        { classId, name, edition },
        { classId, name, edition, description: "Cross-edition guard test fixture.", slug },
        {},
      );
    [subId2014, subId2024, subIdShared] = await Promise.all([
      mk(SUB_2014, "EDITION_2014", "xed-domain-2014"),
      mk(SUB_2024, "EDITION_2024", "xed-domain-2024"),
      mk(SUB_SHARED, null, "xed-domain-shared"),
    ]).then((rows) => rows.map((r) => r.id));
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "XEd Create" } } });
    await prisma.subclass.deleteMany({ where: { name: { in: [SUB_2014, SUB_2024, SUB_SHARED] } } });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  async function createWithSubclass(rulesEdition: "EDITION_2014" | "EDITION_2024", name: string, subclassId: string) {
    return agent()
      .post("/api/characters")
      .send({
        name,
        alignment: "True Neutral",
        race: "Hill Dwarf",
        background: "Sage",
        classes: [{ name: CLASS_NAME, subclassId }],
        abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 15, charisma: 8 },
        rulesEdition,
      });
  }

  it("(AC) rejects a 2024-tagged subclass for a 2014 character at creation, on edition wording — not the gate message", async () => {
    const res = await createWithSubclass("EDITION_2014", "XEd Create 2014a", subId2024);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
    expect(res.body.error).not.toMatch(/not at creation/);
  });

  it("(NULL-row AC) accepts the shared subclass at creation, linking the catalog id", async () => {
    const res = await createWithSubclass("EDITION_2014", "XEd Create 2014b", subIdShared);
    expect(res.status).toBe(201);
    const char = await agent().get(`/api/characters/${res.body.id}`);
    expect(char.body.classes[0].subclass).toBe(SUB_SHARED);
  });

  it("(unchanged) accepts a same-edition subclass at creation", async () => {
    const res = await createWithSubclass("EDITION_2014", "XEd Create 2014c", subId2014);
    expect(res.status).toBe(201);
  });
});
