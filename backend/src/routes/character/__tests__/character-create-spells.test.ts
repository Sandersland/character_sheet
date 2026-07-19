import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

// #1131: the creation spell/cantrip picker. A level-1 caster (Warlock: 2 cantrips
// + 2 prepared spells per SRD 5.2) finishes with a prepared spellbook; a
// non-caster sending picks is a 400. Real seeded catalog (Warlock + real spells).
const OWNER_ID = "owner-create-spells";
let COOKIE: string;
const app = createApp();

const BASE = {
  alignment: "True Neutral",
  race: "Hill Dwarf",
  background: "Sage",
  abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
};

function create(body: object) {
  return supertest(app).post("/api/characters").set("Cookie", COOKIE).send(body);
}

async function warlockPicks() {
  const cantrips = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 0 }, take: 2, select: { id: true } });
  const spells = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 1 }, take: 2, select: { id: true } });
  return { cantripIds: cantrips.map((s) => s.id), spellIds: spells.map((s) => s.id) };
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "CreateSpells" } } });
});
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "CreateSpells" } } });
});

describe("POST /api/characters — creation spell/cantrip picks (#1131)", () => {
  it("a Warlock with 2 cantrips + 2 spells finishes with a 4-entry prepared book", async () => {
    const picks = await warlockPicks();
    const res = await create({ ...BASE, name: "CreateSpells Warlock", classes: [{ name: "Warlock" }], spells: picks });

    expect(res.status).toBe(201);
    const book = res.body.spellcasting.spells as Array<{ level: number; prepared: boolean }>;
    expect(book).toHaveLength(4);
    expect(book.every((s) => s.prepared)).toBe(true);
    // Only the two leveled prepared spells count toward the prepared cap (cantrips excluded).
    expect(res.body.spellcasting.preparedSpellCount).toBe(2);
  });

  it("rejects wrong counts with the expected numbers", async () => {
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells WrongCount",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [picks.cantripIds[0]], spellIds: picks.spellIds },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 2 cantrip/i);
  });

  it("rejects an off-list spell", async () => {
    const picks = await warlockPicks();
    const clericSpell = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "cleric" }, level: 1, NOT: { classes: { has: "warlock" } } }, select: { id: true } });
    const res = await create({
      ...BASE,
      name: "CreateSpells OffList",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: picks.cantripIds, spellIds: [picks.spellIds[0], clericSpell.id] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell list/i);
  });

  it("rejects a leveled spell placed in cantripIds", async () => {
    const picks = await warlockPicks();
    // A third, distinct leveled warlock spell so the level check (not the dup check) fires.
    const [, , extra] = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 1 }, take: 3, select: { id: true } });
    const res = await create({
      ...BASE,
      name: "CreateSpells LeveledCantrip",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [picks.cantripIds[0], extra.id], spellIds: picks.spellIds },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a cantrip/i);
  });

  it("rejects a duplicate id", async () => {
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells Dup",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [picks.cantripIds[0], picks.cantripIds[0]], spellIds: picks.spellIds },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only once/i);
  });

  it("rejects an unknown id", async () => {
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells Unknown",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: picks.cantripIds, spellIds: [picks.spellIds[0], "no-such-spell-id"] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown spell id/i);
  });

  it("rejects a non-caster (Fighter) sending spells", async () => {
    const res = await create({
      ...BASE,
      name: "CreateSpells Fighter",
      classes: [{ name: "Fighter" }],
      spells: { cantripIds: [], spellIds: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not cast spells at level 1/i);
  });

  it("a caster that omits spells is created with an empty book", async () => {
    const res = await create({ ...BASE, name: "CreateSpells NoSpells", classes: [{ name: "Warlock" }] });
    expect(res.status).toBe(201);
    const book = (res.body.spellcasting?.spells ?? []) as unknown[];
    expect(book).toHaveLength(0);
  });
});
