import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

// A level-1 Warlock: 2 cantrips + 2 prepared spells (SRD 5.2).
const OWNER_ID = "owner-create-spells";
let COOKIE: string;

const BASE = {
  alignment: "True Neutral",
  background: "Sage",
  abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
};

// The species anchor resolves per the requested edition; a missing rulesEdition defaults to 2024, matching the create route's own default (#1684).
async function create(body: { rulesEdition?: string } & Record<string, unknown>) {
  const anchor = await seededSpeciesAnchor((body.rulesEdition as "EDITION_2014" | "EDITION_2024") ?? "EDITION_2024");
  return supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...anchor, ...body });
}

async function catalogSpellIds(className: string, level: number, edition: "EDITION_2014" | "EDITION_2024", count: number): Promise<string[]> {
  const res = await supertest(app).get(`/api/spells?class=${className}&edition=${edition}`).set("Cookie", COOKIE);
  const matches = (res.body as Array<{ id: string; level: number }>).filter((s) => s.level === level);
  return matches.slice(0, count).map((s) => s.id);
}

async function warlockPicks(edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024") {
  return {
    cantripIds: await catalogSpellIds("warlock", 0, edition, 2),
    spellIds: await catalogSpellIds("warlock", 1, edition, 2),
  };
}

async function picksFor(className: string, cantripCount: number, spellCount: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014") {
  return {
    cantripIds: await catalogSpellIds(className, 0, edition, cantripCount),
    spellIds: await catalogSpellIds(className, 1, edition, spellCount),
  };
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
    expect(res.body.abilityScores.intelligence).toBe(12);
    expect(res.body.abilityScores.constitution).toBe(15);
    expect(res.body.advancements).toHaveLength(1);
    expect(res.body.advancements[0]).toMatchObject({ origin: true, kind: "feat" });
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
    const clericSpell = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "cleric" } }, level: 1, edition: "EDITION_2024", NOT: { classMemberships: { some: { className: "warlock" } } } }, select: { id: true } });
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
    // picks.spellIds comes from /api/spells (ordered); this raw Prisma scan is unordered, so `extra` must explicitly exclude picks.spellIds.
    const [extra] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024", id: { notIn: picks.spellIds } }, take: 1, select: { id: true } });
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

// The Fiend's PHB'14 Expanded Spell List is list-expansion, not a free grant.
describe("POST /api/characters — subclass spell-list expansion at creation (#1631)", () => {
  async function requireSubclassId(className: string, subclassName: string, edition: "EDITION_2014" | "EDITION_2024" | null): Promise<string> {
    const cls = await prisma.characterClass.findUniqueOrThrow({ where: { name: className }, select: { id: true } });
    const sub = await prisma.subclass.findFirstOrThrow({ where: { classId: cls.id, name: subclassName, edition }, select: { id: true } });
    return sub.id;
  }

  it("a 2014 Fiend Warlock may pick Burning Hands (off the base Warlock list, on the patron's expansion) as a known spell", async () => {
    const fiendId = await requireSubclassId("Warlock", "The Fiend", null);
    const burningHands = await prisma.spell.findFirstOrThrow({
      where: { name: "Burning Hands", edition: "EDITION_2014", NOT: { classMemberships: { some: { className: "warlock" } } } },
      select: { id: true },
    });
    const cantripIds = await catalogSpellIds("warlock", 0, "EDITION_2014", 2);
    const [ownListSpellId] = await catalogSpellIds("warlock", 1, "EDITION_2014", 1);

    const res = await create({
      ...BASE,
      name: "CreateSpells1631 Fiend",
      classes: [{ name: "Warlock", subclassId: fiendId }],
      rulesEdition: "EDITION_2014",
      spells: { cantripIds, spellIds: [ownListSpellId, burningHands.id] },
    });

    expect(res.status).toBe(201);
    const spellIds = (res.body.spellcasting.spells as Array<{ spellId?: string }>).map((s) => s.spellId);
    expect(spellIds).toContain(burningHands.id);
  });

  it("a 2014 Warlock with NO subclass chosen still rejects the same off-list spell", async () => {
    const burningHands = await prisma.spell.findFirstOrThrow({
      where: { name: "Burning Hands", edition: "EDITION_2014", NOT: { classMemberships: { some: { className: "warlock" } } } },
      select: { id: true },
    });
    const cantripIds = await catalogSpellIds("warlock", 0, "EDITION_2014", 2);
    const [ownListSpellId] = await catalogSpellIds("warlock", 1, "EDITION_2014", 1);

    const res = await create({
      ...BASE,
      name: "CreateSpells1631 NoSubclass",
      classes: [{ name: "Warlock" }],
      rulesEdition: "EDITION_2014",
      spells: { cantripIds, spellIds: [ownListSpellId, burningHands.id] },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell list/i);
  });
});

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

  // creationSpellEntry sets prepared: true unconditionally, regardless of the class's known/prepared caster model.
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

// Proven at the write side (the raw stored blob), not just the served view — buildSpellcastingView's read-side clamp (#1127) would otherwise mask a missing write-time clamp.
describe("POST /api/characters — wizard spellbook vs. prepared cap (#1513)", () => {
  it("a Wizard scribes 6 level-1 spells and has exactly 4 prepared (INT 16) — both editions", async () => {
    for (const rulesEdition of ["EDITION_2014", "EDITION_2024"] as const) {
      const picks = await picksFor("wizard", 3, 6, rulesEdition);
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
      // The first 4 picks (pick order) stay prepared, matching clampPreparedToLimit's read-side "first N" rule.
      expect(leveled.slice(0, 4).every((s) => s.prepared), rulesEdition).toBe(true);
      expect(leveled.slice(4).every((s) => !s.prepared), rulesEdition).toBe(true);
      expect(res.body.spellcasting.preparedSpellCount, rulesEdition).toBe(4);
      expect(res.body.spellcasting.preparedSpellLimit, rulesEdition).toBe(4);

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
    const picks = await picksFor("wizard", 3, 4, "EDITION_2024");
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

// resolveCreationSpells rejects a submitted spell id that is provably the wrong edition's fork of a name.
describe("POST /api/characters — cross-edition spell-fork rejection (#1712)", () => {
  const FORK_NAME = "CreateSpells1712 Fork Cantrip";

  async function seedFork() {
    const row2014 = {
      name: FORK_NAME, level: 0, school: "evocation" as const, castingTime: "1 action", range: "30 feet",
      duration: "Instantaneous", description: "The PHB'14 text.", concentration: false, ritual: false, cantripScaling: true,
    };
    const row2024 = { ...row2014, description: "The SRD 5.2 text." };
    // catalogEntryId (#1796) is required, no default — each fork is its own distinct CatalogEntry (business key includes edition).
    const catalogEntryId2014 = await makeCatalogEntry({ name: FORK_NAME, edition: "EDITION_2014" });
    const catalogEntryId2024 = await makeCatalogEntry({ name: FORK_NAME, edition: "EDITION_2024" });
    const fork2014 = await upsertEditionRow(
      prisma.spell,
      { name: FORK_NAME, edition: "EDITION_2014" },
      { ...row2014, edition: "EDITION_2014", catalogEntryId: catalogEntryId2014 },
      row2014,
    );
    const fork2024 = await upsertEditionRow(
      prisma.spell,
      { name: FORK_NAME, edition: "EDITION_2024" },
      { ...row2024, edition: "EDITION_2024", catalogEntryId: catalogEntryId2024 },
      row2024,
    );
    for (const spellId of [fork2014.id, fork2024.id]) {
      await prisma.spellClass.upsert({
        where: { spellId_className: { spellId, className: "warlock" } },
        create: { spellId, className: "warlock" },
        update: {},
      });
    }
    return { fork2014, fork2024 };
  }

  // warlockPicks() takes an unordered `take: 2`; once the fork rows exist as warlock-tagged level-0 spells they're eligible to be picked by it too, which would silently duplicate the fork id.
  async function otherWarlockCantripId(edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024"): Promise<string> {
    const row = await prisma.spell.findFirstOrThrow({
      where: { classMemberships: { some: { className: "warlock" } }, level: 0, edition, name: { not: FORK_NAME } },
      select: { id: true },
    });
    return row.id;
  }

  afterAll(async () => {
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE, #1796); the reverse cascade doesn't exist, so a plain spell.deleteMany would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: FORK_NAME, kind: "SPELL" } });
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
    // Pair the wrong-fork id with the requesting edition's own real rows, or the 400 under test gets masked by an unrelated cross-edition rejection on otherCantrip/picks.
    const otherCantrip = await otherWarlockCantripId("EDITION_2014");
    const picks = await warlockPicks("EDITION_2014");
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
