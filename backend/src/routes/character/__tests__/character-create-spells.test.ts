import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

// #1131: the creation spell/cantrip picker. A level-1 caster (Warlock: 2 cantrips
// + 2 prepared spells per SRD 5.2) finishes with a prepared spellbook; a
// non-caster sending picks is a 400. Real seeded catalog (Warlock + real spells).
const OWNER_ID = "owner-create-spells";
let COOKIE: string;

const BASE = {
  alignment: "True Neutral",
  background: "Sage",
  abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
};

// #1684: the species anchor is resolved per the REQUESTED edition (a missing
// rulesEdition defaults to 2024, same default the create route itself uses).
async function create(body: { rulesEdition?: string } & Record<string, unknown>) {
  const anchor = await seededSpeciesAnchor((body.rulesEdition as "EDITION_2014" | "EDITION_2024") ?? "EDITION_2024");
  return supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...anchor, ...body });
}

async function warlockPicks() {
  const cantrips = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 0 }, take: 2, select: { id: true } });
  const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 1 }, take: 2, select: { id: true } });
  return { cantripIds: cantrips.map((s) => s.id), spellIds: spells.map((s) => s.id) };
}

// #1510: picks a class's spell-list catalog rows for a 2014 creation body —
// cantripCount cantrips + spellCount level-1 spells, from the real seeded catalog.
async function picksFor(className: string, cantripCount: number, spellCount: number) {
  const cantrips = await prisma.spell.findMany({ where: { classMemberships: { some: { className: className } }, level: 0 }, take: cantripCount, select: { id: true } });
  const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: className } }, level: 1 }, take: spellCount, select: { id: true } });
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
    const clericSpell = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "cleric" } }, level: 1, NOT: { classMemberships: { some: { className: "warlock" } } } }, select: { id: true } });
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
    const [, , extra] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 1 }, take: 3, select: { id: true } });
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

// #1712: cross-edition admission — resolveCreationSpells rejects a submitted
// spell id that is provably the WRONG edition's fork of a name (a same-named
// row the requesting edition actually resolves to exists). Today's real
// catalog has no forks (2014 content slices haven't landed), so this proves
// the mechanism with a fixture fork rather than real catalog rows — the two
// existing describe blocks above already prove a 2014/2024 creation accepts
// today's (unforked, EDITION_2024-tagged) real catalog unchanged.
describe("POST /api/characters — cross-edition spell-fork rejection (#1712)", () => {
  const FORK_NAME = "CreateSpells1712 Fork Cantrip";

  async function seedFork() {
    const row2014 = {
      name: FORK_NAME, level: 0, school: "evocation" as const, castingTime: "1 action", range: "30 feet",
      duration: "Instantaneous", description: "The PHB'14 text.", concentration: false, ritual: false, cantripScaling: true,
    };
    const row2024 = { ...row2014, description: "The SRD 5.2 text." };
    const fork2014 = await upsertEditionRow(prisma.spell, { name: FORK_NAME, edition: "EDITION_2014" }, { ...row2014, edition: "EDITION_2014" }, row2014);
    const fork2024 = await upsertEditionRow(prisma.spell, { name: FORK_NAME, edition: "EDITION_2024" }, { ...row2024, edition: "EDITION_2024" }, row2024);
    for (const spellId of [fork2014.id, fork2024.id]) {
      await prisma.spellClass.upsert({
        where: { spellId_className: { spellId, className: "warlock" } },
        create: { spellId, className: "warlock" },
        update: {},
      });
    }
    return { fork2014, fork2024 };
  }

  // A second warlock cantrip id, explicitly excluding FORK_NAME — warlockPicks()
  // takes an unordered `take: 2` off the live catalog, and once the fork rows
  // exist as warlock-tagged level-0 spells they're eligible to be picked BY
  // that query too, which would silently duplicate the fork id in a two-cantrip
  // submission (a "chosen only once" 400 masking the assertion under test).
  async function otherWarlockCantripId(): Promise<string> {
    const row = await prisma.spell.findFirstOrThrow({
      where: { classMemberships: { some: { className: "warlock" } }, level: 0, name: { not: FORK_NAME } },
      select: { id: true },
    });
    return row.id;
  }

  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: FORK_NAME } });
  });

  it("rejects a 2024 creation submitting the 2014 fork's id, naming the spell", async () => {
    const { fork2014 } = await seedFork();
    const otherCantrip = await otherWarlockCantripId();
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells1712 Wrong2014",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [fork2014.id, otherCantrip], spellIds: picks.spellIds },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${FORK_NAME} is 2014 rules content, not usable by a 2024 rules character`);
  });

  it("rejects a 2014 creation submitting the 2024 fork's id, naming the spell", async () => {
    const { fork2024 } = await seedFork();
    const otherCantrip = await otherWarlockCantripId();
    // Warlock has no 2014-tagged cantrip catalog yet — pairing the wrong-fork id
    // with the OTHER real (unforked, EDITION_2024) cantrip id it accepts
    // elsewhere in this file is enough: this test targets the fork check
    // specifically, not the full 2014 Warlock creation count.
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells1712 Wrong2024",
      rulesEdition: "EDITION_2014",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [fork2024.id, otherCantrip], spellIds: picks.spellIds },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${FORK_NAME} is 2024 rules content, not usable by a 2014 rules character`);
  });

  it("admits the requesting edition's OWN fork — the rejection is fork-specific, not a blanket cross-edition ban", async () => {
    const { fork2024 } = await seedFork();
    const otherCantrip = await otherWarlockCantripId();
    const picks = await warlockPicks();
    const res = await create({
      ...BASE,
      name: "CreateSpells1712 RightFork",
      classes: [{ name: "Warlock" }],
      spells: { cantripIds: [fork2024.id, otherCantrip], spellIds: picks.spellIds },
    });
    expect(res.status, res.body.error ?? "").toBe(201);
    const names = (res.body.spellcasting.spells as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain(FORK_NAME);
  });
});
