import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

// #1131: the creation spell/cantrip picker. A level-1 caster (Warlock: 2 cantrips
// + 2 prepared spells per SRD 5.2) finishes with a prepared spellbook; a
// non-caster sending picks is a 400. Real seeded catalog (Warlock + real spells).
const OWNER_ID = "owner-create-spells";
let COOKIE: string;

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

// #1510: picks a class's spell-list catalog rows for a 2014 creation body —
// cantripCount cantrips + spellCount level-1 spells, from the real seeded catalog.
async function picksFor(className: string, cantripCount: number, spellCount: number) {
  const cantrips = await prisma.spell.findMany({ where: { classes: { has: className }, level: 0 }, take: cantripCount, select: { id: true } });
  const spells = await prisma.spell.findMany({ where: { classes: { has: className }, level: 1 }, take: spellCount, select: { id: true } });
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

  // #1131 × #1130: the two creation features must compose in one create body — a
  // caster with BOTH a background ability spread AND spell picks gets both applied.
  it("applies a background ability spread AND spell picks in one create body", async () => {
    const picks = await warlockPicks();
    const res = await create({
      ...BASE, // Sage draws its +2/+1 spread from Con/Int/Wis and grants Magic Initiate.
      name: "CreateSpells Composed",
      classes: [{ name: "Warlock" }],
      backgroundAbilities: { intelligence: 2, constitution: 1 },
      spells: picks,
    });

    expect(res.status).toBe(201);
    // Background spread baked into the effective scores (base int 10→12, con 14→15).
    expect(res.body.abilityScores.intelligence).toBe(12);
    expect(res.body.abilityScores.constitution).toBe(15);
    // Origin feat rides the advancements array, separate from the spell blob.
    expect(res.body.advancements).toHaveLength(1);
    expect(res.body.advancements[0]).toMatchObject({ origin: true, kind: "feat" });
    // Spell picks land in the book unperturbed by the background grant.
    expect(res.body.spellcasting.spells).toHaveLength(4);
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

// #1510: the SRD 5.1 creation-pick counts, enforced by creationSpellCountError
// via level1SpellPicksFor — same catalog, same route, edition threaded on the
// create body. All default-edition (2024) tests above stay unchanged/untouched.
describe("POST /api/characters — 2014 creation spell picks (#1510)", () => {
  it("rejects a 2014 Ranger sending spells (no Spellcasting until level 2, PHB'14 p. 92)", async () => {
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 Ranger",
      classes: [{ name: "Ranger" }],
      rulesEdition: "EDITION_2014",
      spells: { cantripIds: [], spellIds: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not cast spells at level 1/i);
  });

  it("a 2014 Ranger that omits spells is created with an empty book", async () => {
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 RangerNoSpells",
      classes: [{ name: "Ranger" }],
      rulesEdition: "EDITION_2014",
    });
    expect(res.status).toBe(201);
    const book = (res.body.spellcasting?.spells ?? []) as unknown[];
    expect(book).toHaveLength(0);
  });

  it("a 2014 Cleric picks 3 cantrips and 0 spells — no creation-time list exists in SRD 5.1", async () => {
    const picks = await picksFor("cleric", 3, 0);
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 Cleric",
      classes: [{ name: "Cleric" }],
      rulesEdition: "EDITION_2014",
      spells: picks,
    });
    expect(res.status).toBe(201);
    const book = res.body.spellcasting.spells as Array<{ level: number }>;
    expect(book).toHaveLength(3);
    expect(book.every((s) => s.level === 0)).toBe(true);
  });

  it("a 2014 Druid picks 2 cantrips and 0 spells — same prepared-from-full-list shape as Cleric", async () => {
    const picks = await picksFor("druid", 2, 0);
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 Druid",
      classes: [{ name: "Druid" }],
      rulesEdition: "EDITION_2014",
      spells: picks,
    });
    expect(res.status).toBe(201);
    const book = res.body.spellcasting.spells as Array<{ level: number }>;
    expect(book).toHaveLength(2);
    expect(book.every((s) => s.level === 0)).toBe(true);
  });

  it("rejects a 2014 Cleric sending 4 level-1 spells", async () => {
    const picks = await picksFor("cleric", 3, 4);
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 ClericTooMany",
      classes: [{ name: "Cleric" }],
      rulesEdition: "EDITION_2014",
      spells: picks,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 0 level-1 spell/i);
  });

  it("a 2014 Wizard scribes 3 cantrips + 6 level-1 spells into the spellbook", async () => {
    const picks = await picksFor("wizard", 3, 6);
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 Wizard",
      classes: [{ name: "Wizard" }],
      rulesEdition: "EDITION_2014",
      spells: picks,
    });
    expect(res.status).toBe(201);
    expect(res.body.spellcasting.spells).toHaveLength(9);
  });

  it("rejects a 2014 Wizard sending only 4 level-1 spells (spellbook size is 6, not the 2024 prepared count)", async () => {
    const picks = await picksFor("wizard", 3, 4);
    const res = await create({
      ...BASE,
      name: "CreateSpells2014 WizardTooFew",
      classes: [{ name: "Wizard" }],
      rulesEdition: "EDITION_2014",
      spells: picks,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 6 level-1 spell/i);
  });

  const KNOWN_CASTERS_2014 = [
    { name: "Bard", cantrips: 2, spells: 4 },
    { name: "Sorcerer", cantrips: 4, spells: 2 },
    { name: "Warlock", cantrips: 2, spells: 2 },
  ] as const;

  // #1131 AC-6 pin, carried into 2014: creationSpellEntry sets `prepared: true`
  // unconditionally regardless of the class's known/prepared caster model
  // (#1507's casterModelFor) — the known-vs-prepared sheet bookkeeping split
  // is #1507 D5/D7's concern, not #1510's.
  it("a 2014 known caster (Bard/Sorcerer/Warlock) still finishes with every entry prepared: true", async () => {
    for (const { name, cantrips, spells } of KNOWN_CASTERS_2014) {
      const picks = await picksFor(name.toLowerCase(), cantrips, spells);
      const res = await create({
        ...BASE,
        name: `CreateSpells2014 ${name}`,
        classes: [{ name }],
        rulesEdition: "EDITION_2014",
        spells: picks,
      });
      expect(res.status, `${name}: ${res.body.error ?? ""}`).toBe(201);
      const book = res.body.spellcasting.spells as Array<{ prepared: boolean }>;
      expect(book.every((s) => s.prepared), name).toBe(true);
    }
  });
});

// #1513: the wizard scribes its full 6-spell spellbook at creation, but only
// preparedSpellLimit of those leveled picks stay prepared — both editions, and
// proven at the write side (the raw stored blob), not just the served view,
// since buildSpellcastingView's read-side clamp (#1127) would otherwise mask a
// missing write-time clamp.
describe("POST /api/characters — wizard spellbook vs. prepared cap (#1513)", () => {
  it("a Wizard scribes 6 level-1 spells and has exactly 4 prepared (INT 16) — both editions", async () => {
    for (const rulesEdition of ["EDITION_2014", "EDITION_2024"] as const) {
      const picks = await picksFor("wizard", 3, 6);
      const res = await create({
        ...BASE,
        name: `CreateSpells1513 Wizard ${rulesEdition}`,
        classes: [{ name: "Wizard" }],
        rulesEdition,
        abilityScores: { ...BASE.abilityScores, intelligence: 16 },
        spells: picks,
      });
      expect(res.status, res.body.error ?? "").toBe(201);

      const book = res.body.spellcasting.spells as Array<{ id: string; level: number; prepared: boolean }>;
      expect(book, rulesEdition).toHaveLength(9);
      const leveled = book.filter((s) => s.level > 0);
      expect(leveled, rulesEdition).toHaveLength(6);
      // The FIRST 4 picks (pick order) stay prepared; the last 2 do not —
      // deterministic, matching clampPreparedToLimit's read-side "first N" rule.
      expect(leveled.slice(0, 4).every((s) => s.prepared), rulesEdition).toBe(true);
      expect(leveled.slice(4).every((s) => !s.prepared), rulesEdition).toBe(true);
      expect(res.body.spellcasting.preparedSpellCount, rulesEdition).toBe(4);
      expect(res.body.spellcasting.preparedSpellLimit, rulesEdition).toBe(4);

      // Write-side proof: the RAW stored blob already has the clamp applied
      // (trimmedCount 0 on read) rather than storing 6 prepared:true entries
      // and relying on the read-side clamp to trim them on every future read.
      const character = await prisma.character.findFirstOrThrow({
        where: { name: `CreateSpells1513 Wizard ${rulesEdition}` },
        select: { spellcasting: true },
      });
      const stored = (character.spellcasting as { spells: Array<{ level: number; prepared: boolean }> }).spells;
      const storedLeveled = stored.filter((s) => s.level > 0);
      expect(storedLeveled.filter((s) => s.prepared), rulesEdition).toHaveLength(4);
      expect(storedLeveled.filter((s) => !s.prepared), rulesEdition).toHaveLength(2);
    }
  });

  it("a 2024 Wizard sending 4 level-1 spells is a 400 naming 6, not 4 (mutation proof for the spellbook/prepared conflation)", async () => {
    const picks = await picksFor("wizard", 3, 4);
    const res = await create({
      ...BASE,
      name: "CreateSpells1513 WizardTooFew2024",
      classes: [{ name: "Wizard" }],
      spells: picks,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 6 level-1 spell/i);
  });

  it("a Warlock (known caster, no spellbook split) stays byte-identical: all 4 entries prepared", async () => {
    const picks = await warlockPicks();
    const res = await create({ ...BASE, name: "CreateSpells1513 Warlock", classes: [{ name: "Warlock" }], spells: picks });
    expect(res.status).toBe(201);
    const book = res.body.spellcasting.spells as Array<{ prepared: boolean }>;
    expect(book).toHaveLength(4);
    expect(book.every((s) => s.prepared)).toBe(true);
    expect(res.body.spellcasting.preparedSpellCount).toBe(2);
  });
});
