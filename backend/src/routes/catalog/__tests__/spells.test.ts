import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const OWNER_ID = "owner-spells";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

// `classes` is not a Spell column — SpellClass carries membership (#1711).
const DAMAGE_SPELL_CLASSES = ["wizard", "sorcerer"];
const DAMAGE_SPELL = {
  name: "Test Firebolt Catalog",
  level: 2,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "A test damage spell.",
  concentration: false,
  ritual: false,
  effectKind: "damage",
  effectDiceCount: 3,
  effectDiceFaces: 6,
  effectModifier: 1,
  damageType: "fire",
  attackType: "save",
  saveAbility: "dexterity",
  upcastDicePerLevel: 1,
  cantripScaling: false,
};
const UTILITY_SPELL_CLASSES = ["cleric", "druid"];
const UTILITY_SPELL = {
  name: "Test Guidance Catalog",
  level: 0,
  school: "divination" as const,
  castingTime: "1 action",
  range: "Touch",
  duration: "Concentration, up to 1 minute",
  description: "A test utility cantrip.",
  concentration: true,
  ritual: false,
  cantripScaling: true,
};

async function seedSpellClasses(spellId: string, classNames: string[]) {
  for (const className of classNames) {
    await prisma.spellClass.upsert({
      where: { spellId_className: { spellId, className } },
      create: { spellId, className },
      update: {},
    });
  }
}

// upsertEditionRow, not .upsert(): Spell's business key is (name, edition) (#1710); catalogEntryId is resolved first via makeCatalogEntry, which finds-then-creates so repeat calls reuse it (#1796).
async function seedFixtures() {
  const damageCatalogEntryId = await makeCatalogEntry({ name: DAMAGE_SPELL.name });
  const damage = await upsertEditionRow(
    prisma.spell,
    { name: DAMAGE_SPELL.name, edition: null },
    { ...DAMAGE_SPELL, edition: null, catalogEntryId: damageCatalogEntryId },
    DAMAGE_SPELL,
  );
  const utilityCatalogEntryId = await makeCatalogEntry({ name: UTILITY_SPELL.name });
  const utility = await upsertEditionRow(
    prisma.spell,
    { name: UTILITY_SPELL.name, edition: null },
    { ...UTILITY_SPELL, edition: null, catalogEntryId: utilityCatalogEntryId },
    UTILITY_SPELL,
  );
  await seedSpellClasses(damage.id, DAMAGE_SPELL_CLASSES);
  await seedSpellClasses(utility.id, UTILITY_SPELL_CLASSES);
}

function get(path: string, edition: string = "EDITION_2024") {
  const sep = path.includes("?") ? "&" : "?";
  return supertest.agent(app).set("Cookie", COOKIE).get(`${path}${sep}edition=${edition}`);
}

function getAs(cookie: string, path: string, edition: string = "EDITION_2014") {
  const sep = path.includes("?") ? "&" : "?";
  return supertest.agent(app).set("Cookie", cookie).get(`${path}${sep}edition=${edition}`);
}

function names(body: { name: string }[]): string[] {
  return body.map((s) => s.name);
}

describe("GET /api/spells", () => {
  afterAll(async () => {
    // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse doesn't exist, so spell.deleteMany alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: { in: [DAMAGE_SPELL.name, UTILITY_SPELL.name] }, kind: "SPELL" } });
  });

  it("returns the spell catalog ordered by level then name, mapping effect fields", async () => {
    await seedFixtures();

    const response = await get("/api/spells");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const levels = response.body.map((s: { level: number }) => s.level);
    expect([...levels]).toEqual([...levels].sort((a, b) => a - b));

    const damage = response.body.find((s: { name: string }) => s.name === DAMAGE_SPELL.name);
    expect(damage).toMatchObject({
      level: 2,
      school: "evocation",
      concentration: false,
      ritual: false,
      classes: DAMAGE_SPELL_CLASSES,
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 6,
      effectModifier: 1,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      upcastDicePerLevel: 1,
      cantripScaling: false,
    });

    // The utility cantrip leaves every effect column null — the mapper's `?? undefined` collapses them so JSON omits the keys entirely.
    const utility = response.body.find((s: { name: string }) => s.name === UTILITY_SPELL.name);
    expect(utility).toMatchObject({ level: 0, school: "divination", concentration: true, cantripScaling: true });
    expect(utility.effectKind).toBeUndefined();
    expect(utility.damageType).toBeUndefined();
    expect(utility.saveAbility).toBeUndefined();
    expect(utility.upcastDicePerLevel).toBeUndefined();
  });
});

describe("GET /api/spells — ?class= / ?maxLevel= filters (#1377)", () => {
  beforeAll(seedFixtures);

  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: { in: [DAMAGE_SPELL.name, UTILITY_SPELL.name] } } });
  });

  it("?class= keeps only spells whose classes contain the (lowercased) name", async () => {
    const response = await get("/api/spells?class=Wizard");

    expect(response.status).toBe(200);
    expect(names(response.body)).toContain(DAMAGE_SPELL.name);
    expect(names(response.body)).not.toContain(UTILITY_SPELL.name);
    expect(response.body.every((s: { classes: string[] }) => s.classes.includes("wizard"))).toBe(true);
  });

  it("?maxLevel= keeps only spells at or below that level", async () => {
    const response = await get("/api/spells?maxLevel=1");

    expect(response.status).toBe(200);
    expect(response.body.every((s: { level: number }) => s.level <= 1)).toBe(true);
    expect(names(response.body)).not.toContain(DAMAGE_SPELL.name);
  });

  it("?maxLevel=0 is legal and returns cantrips only (not a 400)", async () => {
    const response = await get("/api/spells?maxLevel=0");

    expect(response.status).toBe(200);
    expect(response.body.every((s: { level: number }) => s.level === 0)).toBe(true);
    expect(names(response.body)).toContain(UTILITY_SPELL.name);
  });

  it("combines both filters — the creation-ceremony request shape", async () => {
    const response = await get("/api/spells?class=cleric&maxLevel=1");

    expect(response.status).toBe(200);
    expect(names(response.body)).toContain(UTILITY_SPELL.name);
    expect(names(response.body)).not.toContain(DAMAGE_SPELL.name);
    expect(
      response.body.every((s: { level: number; classes: string[] }) => s.level <= 1 && s.classes.includes("cleric")),
    ).toBe(true);
  });

  it("an unknown class is an empty list, not an error", async () => {
    const response = await get("/api/spells?class=notaclass");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("400s an out-of-band maxLevel or a blank class", async () => {
    expect((await get("/api/spells?maxLevel=10")).status).toBe(400);
    expect((await get("/api/spells?maxLevel=")).status).toBe(400);
    expect((await get("/api/spells?class=")).status).toBe(400);
  });

  it("no params still returns the full catalog, so the sheet picker is untouched", async () => {
    const filtered = await get("/api/spells?class=wizard");
    const all = await get("/api/spells");

    expect(all.status).toBe(200);
    expect(names(all.body)).toContain(DAMAGE_SPELL.name);
    expect(names(all.body)).toContain(UTILITY_SPELL.name);
    expect(all.body.length).toBeGreaterThan(filtered.body.length);
  });
});

describe("GET /api/spells — ?subclassId= list-expansion widening (#1631)", () => {
  it("a 2014 Fiend Warlock's ?subclassId= adds Burning Hands, off the base Warlock list", async () => {
    const warlock = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Warlock" }, select: { id: true } });
    const fiend = await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" }, select: { id: true } });

    const withoutSubclass = await get(`/api/spells?class=warlock&maxLevel=1`, "EDITION_2014");
    expect(names(withoutSubclass.body)).not.toContain("Burning Hands");

    const withSubclass = await get(`/api/spells?class=warlock&maxLevel=1&subclassId=${fiend.id}`, "EDITION_2014");
    expect(withSubclass.status).toBe(200);
    expect(names(withSubclass.body)).toContain("Burning Hands");
    // Only widens — every base-list spell the unwidened request served is still present.
    for (const name of names(withoutSubclass.body)) expect(names(withSubclass.body)).toContain(name);
  });

  it("does not widen for a 2024 request — The Fiend's 2014 list-expansion never applies to a 2024 character", async () => {
    const warlock = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Warlock" }, select: { id: true } });
    const fiend = await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" }, select: { id: true } });

    const response = await get(`/api/spells?class=warlock&maxLevel=1&subclassId=${fiend.id}`, "EDITION_2024");
    expect(response.status).toBe(200);
    expect(names(response.body)).not.toContain("Burning Hands");
  });

  it("?subclassId= with no ?class= is a no-op (the unfiltered catalog already has everything)", async () => {
    const warlock = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Warlock" }, select: { id: true } });
    const fiend = await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" }, select: { id: true } });

    const withSubclassId = await get(`/api/spells?maxLevel=1&subclassId=${fiend.id}`, "EDITION_2014");
    const bare = await get(`/api/spells?maxLevel=1`, "EDITION_2014");
    expect(withSubclassId.status).toBe(200);
    expect(withSubclassId.body).toEqual(bare.body);
  });

  it("an unknown subclassId is a no-op, not an error", async () => {
    const response = await get(`/api/spells?class=warlock&maxLevel=1&subclassId=not-a-real-id`, "EDITION_2014");
    expect(response.status).toBe(200);
    expect(names(response.body)).not.toContain("Burning Hands");
  });

  it("400s a blank subclassId", async () => {
    expect((await get("/api/spells?subclassId=")).status).toBe(400);
  });
});

// Routed through spellListsFor, the same resolver the level-up gate uses, so the two paths can't diverge (#1825).
describe("GET /api/spells — ?class= + ?subclassId= third-caster redirect (#1825)", () => {
  it("an Eldritch Knight's ?subclassId= redirects ?class=fighter to the wizard list, in both editions", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" }, select: { id: true } });
    const eldritchKnight = await prisma.subclass.findFirstOrThrow({
      where: { classId: fighter.id, name: "Eldritch Knight" },
      select: { id: true },
    });

    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const withoutSubclass = await get("/api/spells?class=fighter", edition);
      expect(withoutSubclass.status).toBe(200);
      expect(withoutSubclass.body).toEqual([]); // no spell is ever tagged with class "fighter"

      const withSubclass = await get(`/api/spells?class=fighter&subclassId=${eldritchKnight.id}`, edition);
      expect(withSubclass.status).toBe(200);
      expect(withSubclass.body.length).toBeGreaterThan(0);
      expect(withSubclass.body.every((s: { classes: string[] }) => s.classes.includes("wizard"))).toBe(true);
    }
  });

  it("an Arcane Trickster's ?subclassId= redirects ?class=rogue to the wizard list", async () => {
    const rogue = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Rogue" }, select: { id: true } });
    const arcaneTrickster = await prisma.subclass.findFirstOrThrow({
      where: { classId: rogue.id, name: "Arcane Trickster" },
      select: { id: true },
    });

    const withoutSubclass = await get("/api/spells?class=rogue", "EDITION_2024");
    expect(withoutSubclass.body).toEqual([]);

    const withSubclass = await get(`/api/spells?class=rogue&subclassId=${arcaneTrickster.id}`, "EDITION_2024");
    expect(withSubclass.status).toBe(200);
    expect(withSubclass.body.length).toBeGreaterThan(0);
    expect(withSubclass.body.every((s: { classes: string[] }) => s.classes.includes("wizard"))).toBe(true);
  });

  it("a non-third-caster subclassId (e.g. Champion) does not redirect — ?class=fighter still matches nothing", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" }, select: { id: true } });
    const champion = await prisma.subclass.findFirstOrThrow({
      where: { classId: fighter.id, name: "Champion" },
      select: { id: true },
    });

    const response = await get(`/api/spells?class=fighter&subclassId=${champion.id}`, "EDITION_2024");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("ignores a subclassId whose class is NOT the queried ?class= — no cross-class redirect", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" }, select: { id: true } });
    const eldritchKnight = await prisma.subclass.findFirstOrThrow({
      where: { classId: fighter.id, name: "Eldritch Knight" },
      select: { id: true },
    });

    // A mismatched subclassId is dropped, or this would trip spellListsFor's redirect and leak wizard spells into a cleric query.
    const clericOnly = await get("/api/spells?class=cleric", "EDITION_2024");
    const mismatched = await get(`/api/spells?class=cleric&subclassId=${eldritchKnight.id}`, "EDITION_2024");
    expect(mismatched.status).toBe(200);
    expect(mismatched.body).toEqual(clericOnly.body);
    expect(mismatched.body.every((s: { classes: string[] }) => s.classes.includes("cleric"))).toBe(true);
  });
});

describe("GET /api/spells — class membership served from the SpellClass join (#1711)", () => {
  afterAll(async () => {
    // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse doesn't exist, so spell.deleteMany alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: DAMAGE_SPELL.name, kind: "SPELL" } });
  });

  it("a class only reaches the response after its SpellClass row exists, and stops after it's removed", async () => {
    const catalogEntryId = await makeCatalogEntry({ name: DAMAGE_SPELL.name });
    const damage = await upsertEditionRow(
      prisma.spell,
      { name: DAMAGE_SPELL.name, edition: null },
      { ...DAMAGE_SPELL, edition: null, catalogEntryId },
      DAMAGE_SPELL,
    );

    const beforeAdd = await get("/api/spells?class=ranger");
    expect(names(beforeAdd.body)).not.toContain(DAMAGE_SPELL.name);

    await prisma.spellClass.create({ data: { spellId: damage.id, className: "ranger" } });
    const afterAdd = await get("/api/spells?class=ranger");
    expect(names(afterAdd.body)).toContain(DAMAGE_SPELL.name);
    const served = afterAdd.body.find((s: { name: string }) => s.name === DAMAGE_SPELL.name);
    expect(served.classes).toEqual(["ranger"]);

    await prisma.spellClass.deleteMany({ where: { spellId: damage.id, className: "ranger" } });
    const afterRemove = await get("/api/spells?class=ranger");
    expect(names(afterRemove.body)).not.toContain(DAMAGE_SPELL.name);
  });

  it("cascades: deleting the Spell row drops its SpellClass rows too (onDelete: Cascade)", async () => {
    const catalogEntryId = await makeCatalogEntry({ name: DAMAGE_SPELL.name });
    const damage = await upsertEditionRow(
      prisma.spell,
      { name: DAMAGE_SPELL.name, edition: null },
      { ...DAMAGE_SPELL, edition: null, catalogEntryId },
      DAMAGE_SPELL,
    );
    await prisma.spellClass.create({ data: { spellId: damage.id, className: "wizard" } });

    await prisma.spell.delete({ where: { id: damage.id } });

    expect(await prisma.spellClass.findMany({ where: { spellId: damage.id } })).toEqual([]);
  });
});

// Absent and unrecognized both 400 with distinct messages, matching featsRouter/referenceRouter (#1411/#1412).
describe("GET /api/spells — ?edition= is required (#1712)", () => {
  it("400s with no ?edition= at all, rather than serving a flat cross-edition catalog", async () => {
    const res = await supertest(app).get("/api/spells").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
  });

  it("400s an unrecognized ?edition= value, with a message distinct from the missing-param one", async () => {
    const res = await supertest(app).get("/api/spells?edition=bogus").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Unknown edition: /);
  });

  it("400s for edition even when class/maxLevel are also present", async () => {
    const res = await supertest(app).get("/api/spells?class=wizard&maxLevel=3").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
  });
});

// A genuine fork (same name, two rows) resolves to exactly one row per requesting edition (#1712/#1372/#1753).
describe("GET /api/spells — genuine edition fork resolves to one row per edition (#1712)", () => {
  const FORK_NAME = "Test Fork Catalog Spell";
  // Distinct from FORK_NAME — that name already has a 2014 row from the test above (afterAll cleans up only at block end).
  const LATE_FORK_NAME = "Test Late Fork Catalog Spell";
  const LONE_2024_NAME = "Test Lone 2024-Tagged Catalog Spell";

  function forkRow(name: string, description: string) {
    return {
      name,
      level: 1,
      school: "evocation" as const,
      castingTime: "1 action",
      range: "30 feet",
      duration: "Instantaneous",
      description,
      concentration: false,
      ritual: false,
      cantripScaling: false,
    };
  }

  afterAll(async () => {
    // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse doesn't exist, so spell.deleteMany alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({
      where: { name: { in: [FORK_NAME, LATE_FORK_NAME, LONE_2024_NAME] }, kind: "SPELL" },
    });
  });

  it("a name with both a 2014 and a 2024 row resolves to exactly the requesting edition's own row", async () => {
    const row2014 = forkRow(FORK_NAME, "The PHB'14 text.");
    const row2024 = forkRow(FORK_NAME, "The SRD 5.2 text.");
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

    const res2014 = await get("/api/spells", "EDITION_2014");
    const matches2014 = res2014.body.filter((s: { name: string }) => s.name === FORK_NAME);
    expect(matches2014).toHaveLength(1);
    expect(matches2014[0].id).toBe(fork2014.id);
    expect(matches2014[0].description).toBe("The PHB'14 text.");

    const res2024 = await get("/api/spells", "EDITION_2024");
    const matches2024 = res2024.body.filter((s: { name: string }) => s.name === FORK_NAME);
    expect(matches2024).toHaveLength(1);
    expect(matches2024[0].id).toBe(fork2024.id);
    expect(matches2024[0].description).toBe("The SRD 5.2 text.");
  });

  it("a lone EDITION_2024-tagged row never reaches a 2014 request, with or without a sibling", async () => {
    const row2024 = forkRow(LATE_FORK_NAME, "The SRD 5.2 text.");
    const lateCatalogEntryId2024 = await makeCatalogEntry({ name: LATE_FORK_NAME, edition: "EDITION_2024" });
    await upsertEditionRow(
      prisma.spell,
      { name: LATE_FORK_NAME, edition: "EDITION_2024" },
      { ...row2024, edition: "EDITION_2024", catalogEntryId: lateCatalogEntryId2024 },
      row2024,
    );

    const before2014 = await get("/api/spells", "EDITION_2014");
    expect(names(before2014.body)).not.toContain(LATE_FORK_NAME);
    const before2024 = await get("/api/spells", "EDITION_2024");
    expect(names(before2024.body)).toContain(LATE_FORK_NAME);

    const row2014 = forkRow(LATE_FORK_NAME, "The PHB'14 text.");
    const lateCatalogEntryId2014 = await makeCatalogEntry({ name: LATE_FORK_NAME, edition: "EDITION_2014" });
    const fork2014 = await upsertEditionRow(
      prisma.spell,
      { name: LATE_FORK_NAME, edition: "EDITION_2014" },
      { ...row2014, edition: "EDITION_2014", catalogEntryId: lateCatalogEntryId2014 },
      row2014,
    );
    const after = await get("/api/spells", "EDITION_2014");
    const matches = after.body.filter((s: { name: string }) => s.name === LATE_FORK_NAME);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(fork2014.id);
  });

  it("a lone EDITION_2024-tagged row with no sibling reaches only its own edition (2024's curated list stays curated)", async () => {
    const row2024 = forkRow(LONE_2024_NAME, "Ordinary 2024-tagged content, no 2014 fork.");
    const loneCatalogEntryId = await makeCatalogEntry({ name: LONE_2024_NAME, edition: "EDITION_2024" });
    const lone = await upsertEditionRow(
      prisma.spell,
      { name: LONE_2024_NAME, edition: "EDITION_2024" },
      { ...row2024, edition: "EDITION_2024", catalogEntryId: loneCatalogEntryId },
      row2024,
    );

    const res2024 = await get("/api/spells", "EDITION_2024");
    const matches2024 = res2024.body.filter((s: { name: string }) => s.name === LONE_2024_NAME);
    expect(matches2024).toHaveLength(1);
    expect(matches2024[0].id).toBe(lone.id);

    const res2014 = await get("/api/spells", "EDITION_2014");
    expect(names(res2014.body)).not.toContain(LONE_2024_NAME);
  });

  it("a lone EDITION_2014-tagged row with no sibling reaches only its own edition, never a 2024 request", async () => {
    const LONE_2014_NAME = "Test Lone 2014-Tagged Catalog Spell";
    const row2014 = forkRow(LONE_2014_NAME, "PHB'14-only content, no 2024 counterpart.");
    const loneCatalogEntryId = await makeCatalogEntry({ name: LONE_2014_NAME, edition: "EDITION_2014" });
    const lone = await upsertEditionRow(
      prisma.spell,
      { name: LONE_2014_NAME, edition: "EDITION_2014" },
      { ...row2014, edition: "EDITION_2014", catalogEntryId: loneCatalogEntryId },
      row2014,
    );

    try {
      const res2014 = await get("/api/spells", "EDITION_2014");
      const matches2014 = res2014.body.filter((s: { name: string }) => s.name === LONE_2014_NAME);
      expect(matches2014).toHaveLength(1);
      expect(matches2014[0].id).toBe(lone.id);

      const res2024 = await get("/api/spells", "EDITION_2024");
      expect(names(res2024.body)).not.toContain(LONE_2014_NAME);
    } finally {
      // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse doesn't exist, so spell.deleteMany alone would orphan the entry.
      await prisma.catalogEntry.deleteMany({ where: { name: LONE_2014_NAME, kind: "SPELL" } });
    }
  });

  // ?class= must resolve the RIGHT edition's row first, then check ITS OWN class list (#1715; the real case: 2014 Command has no bard, 2024's does).
  it("?class= reflects the RESOLVED edition's own class list, not a membership that exists only on the other edition's row", async () => {
    const DIVERGENT_NAME = "Test Divergent Class List Spell";
    const row2014 = forkRow(DIVERGENT_NAME, "The PHB'14 text (cleric + paladin only).");
    const row2024 = forkRow(DIVERGENT_NAME, "The SRD 5.2 text (cleric + paladin + bard).");
    const catalogEntryId2014 = await makeCatalogEntry({ name: DIVERGENT_NAME, edition: "EDITION_2014" });
    const catalogEntryId2024 = await makeCatalogEntry({ name: DIVERGENT_NAME, edition: "EDITION_2024" });
    const fork2014 = await upsertEditionRow(
      prisma.spell,
      { name: DIVERGENT_NAME, edition: "EDITION_2014" },
      { ...row2014, edition: "EDITION_2014", catalogEntryId: catalogEntryId2014 },
      row2014,
    );
    const fork2024 = await upsertEditionRow(
      prisma.spell,
      { name: DIVERGENT_NAME, edition: "EDITION_2024" },
      { ...row2024, edition: "EDITION_2024", catalogEntryId: catalogEntryId2024 },
      row2024,
    );
    await seedSpellClasses(fork2014.id, ["cleric", "paladin"]);
    await seedSpellClasses(fork2024.id, ["cleric", "paladin", "bard"]);

    try {
      const bard2014 = await get("/api/spells?class=bard", "EDITION_2014");
      expect(names(bard2014.body)).not.toContain(DIVERGENT_NAME);

      const bard2024 = await get("/api/spells?class=bard", "EDITION_2024");
      expect(names(bard2024.body)).toContain(DIVERGENT_NAME);

      const cleric2014 = await get("/api/spells?class=cleric", "EDITION_2014");
      const clericMatch = cleric2014.body.find((s: { name: string }) => s.name === DIVERGENT_NAME);
      expect(clericMatch?.id).toBe(fork2014.id);
    } finally {
      // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse doesn't exist, so spell.deleteMany alone would orphan the entry.
      await prisma.catalogEntry.deleteMany({ where: { name: DIVERGENT_NAME, kind: "SPELL" } });
    }
  });
});

describe("GET /api/spells — user homebrew (#1786)", () => {
  const OWNER_A = "owner-spells-homebrew-a";
  const OWNER_B = "owner-spells-homebrew-b";
  let cookieA: string;
  let cookieB: string;

  const HOMEBREW_NAME = "Test Homebrew Bolt";

  async function createHomebrew(
    ownerId: string,
    overrides: { name?: string; level?: number; classes?: string[] } = {},
  ) {
    const { classes = [], name = HOMEBREW_NAME, level = 1 } = overrides;
    const catalogEntryId = await makeCatalogEntry({ name, edition: "EDITION_2014", scope: "USER", ownerUserId: ownerId });
    const spell = await prisma.spell.create({
      data: {
        name,
        level,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: "A homebrew test spell.",
        edition: "EDITION_2014",
        catalogEntryId,
      },
    });
    await seedSpellClasses(spell.id, classes);
    return spell;
  }

  // Created once here (not inside an `it`) so the isolation/edition `.not.toContain` assertions below can't pass vacuously for a fixture that never existed.
  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    cookieA = await authCookie(OWNER_A);
    cookieB = await authCookie(OWNER_B);
    await createHomebrew(OWNER_A);
  });

  afterAll(async () => {
    // Deleting CatalogEntry cascades the Spell row; deleting the User also cascades remaining USER-scope entries.
    await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it("a user's own homebrew appears in their own EDITION_2014 catalog", async () => {
    const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
    expect(res.status).toBe(200);
    expect(names(res.body)).toContain(HOMEBREW_NAME);
  });

  // ownerId is the manage UI's only "mine, offer edit/delete" signal — must never leak another owner's id on any row (#1788).
  it("serves ownerId on the caller's own homebrew row, and never a different owner's id on any row", async () => {
    const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
    const homebrewRow = res.body.find((s: { name: string }) => s.name === HOMEBREW_NAME);
    expect(homebrewRow.ownerId).toBe(OWNER_A);

    // Checking one row lacking ownerId proves nothing about another row leaking a different owner's id — assert across every served row.
    const ownedRows = res.body.filter((s: { ownerId?: string }) => s.ownerId !== undefined);
    expect(ownedRows.length).toBeGreaterThan(0);
    expect(ownedRows.every((s: { ownerId?: string }) => s.ownerId === OWNER_A)).toBe(true);
  });

  // saveEffect is written by customSpellSchema (#1787); the manage view's Edit prefill needs it round-tripped (#1788).
  it("serves saveEffect on a homebrew row that has one set", async () => {
    const name = "Test Homebrew Save Effect Bolt";
    const catalogEntryId = await makeCatalogEntry({ name, edition: "EDITION_2014", scope: "USER", ownerUserId: OWNER_A });
    const spell = await prisma.spell.create({
      data: {
        name,
        level: 2,
        school: "evocation",
        castingTime: "1 action",
        range: "60 feet",
        duration: "Instantaneous",
        description: "A homebrew test spell with a save effect.",
        edition: "EDITION_2014",
        catalogEntryId,
        effectKind: "damage",
        effectDiceCount: 2,
        effectDiceFaces: 6,
        damageType: "fire",
        attackType: "save",
        saveAbility: "dexterity",
        saveEffect: "half",
      },
    });

    try {
      const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
      const row = res.body.find((s: { id: string }) => s.id === spell.id);
      expect(row.saveEffect).toBe("half");
    } finally {
      await prisma.catalogEntry.delete({ where: { id: catalogEntryId } });
    }
  });

  it("does NOT leak to a different user (cross-user isolation)", async () => {
    const res = await getAs(cookieB, "/api/spells", "EDITION_2014");
    expect(res.status).toBe(200);
    expect(names(res.body)).not.toContain(HOMEBREW_NAME);
  });

  it("a lone-tagged EDITION_2014 homebrew spell does not appear in an EDITION_2024 request", async () => {
    const res = await getAs(cookieA, "/api/spells", "EDITION_2024");
    expect(res.status).toBe(200);
    expect(names(res.body)).not.toContain(HOMEBREW_NAME);
  });

  it("system (null-owner) spells still appear for every user, homebrew or not", async () => {
    const SYSTEM_NAME = "Test System Spell For Homebrew Suite";
    const systemRow = {
      name: SYSTEM_NAME,
      level: 1,
      school: "evocation" as const,
      castingTime: "1 action",
      range: "30 feet",
      duration: "Instantaneous",
      description: "A shared system spell.",
      cantripScaling: false,
    };
    // The resolver filters GLOBAL visibility by CatalogEntry.edition; the Spell row itself stays edition: null (#1798).
    const systemCatalogEntryId = await makeCatalogEntry({ name: SYSTEM_NAME, edition: "EDITION_2014" });
    await upsertEditionRow(
      prisma.spell,
      { name: SYSTEM_NAME, edition: null },
      { ...systemRow, edition: null, catalogEntryId: systemCatalogEntryId },
      systemRow,
    );

    try {
      const resA = await getAs(cookieA, "/api/spells", "EDITION_2014");
      const resB = await getAs(cookieB, "/api/spells", "EDITION_2014");
      expect(names(resA.body)).toContain(SYSTEM_NAME);
      expect(names(resB.body)).toContain(SYSTEM_NAME);
    } finally {
      await prisma.catalogEntry.deleteMany({ where: { name: SYSTEM_NAME, kind: "SPELL" } });
    }
  });

  it("?class= and ?maxLevel= apply to homebrew rows identically to seeded rows", async () => {
    const FILTERED_NAME = "Test Homebrew Filtered Spell";
    await createHomebrew(OWNER_A, { name: FILTERED_NAME, level: 3, classes: ["wizard"] });

    try {
      const wizardMatch = await getAs(cookieA, "/api/spells?class=wizard&maxLevel=3", "EDITION_2014");
      expect(names(wizardMatch.body)).toContain(FILTERED_NAME);

      const wrongClass = await getAs(cookieA, "/api/spells?class=cleric&maxLevel=3", "EDITION_2014");
      expect(names(wrongClass.body)).not.toContain(FILTERED_NAME);

      const belowLevel = await getAs(cookieA, "/api/spells?class=wizard&maxLevel=2", "EDITION_2014");
      expect(names(belowLevel.body)).not.toContain(FILTERED_NAME);
    } finally {
      await prisma.catalogEntry.deleteMany({ where: { name: FILTERED_NAME, kind: "SPELL" } });
    }
  });

  it("a homebrew spell sharing a NAME with a seeded spell does not shadow or get shadowed", async () => {
    const COLLISION_NAME = "Test Collision Catalog Spell";
    const seededRow = {
      name: COLLISION_NAME,
      level: 2,
      school: "evocation" as const,
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "The seeded version.",
      cantripScaling: false,
    };
    const seededCatalogEntryId = await makeCatalogEntry({ name: COLLISION_NAME, edition: "EDITION_2014" });
    const seeded = await upsertEditionRow(
      prisma.spell,
      { name: COLLISION_NAME, edition: "EDITION_2014" },
      { ...seededRow, edition: "EDITION_2014", catalogEntryId: seededCatalogEntryId },
      seededRow,
    );
    const homebrew = await createHomebrew(OWNER_A, { name: COLLISION_NAME });

    try {
      const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
      const matches = res.body.filter((s: { name: string }) => s.name === COLLISION_NAME);
      expect(matches.map((s: { id: string }) => s.id).sort()).toEqual([seeded.id, homebrew.id].sort());
    } finally {
      await prisma.catalogEntry.deleteMany({ where: { name: COLLISION_NAME, kind: "SPELL" } });
    }
  });
});

describe("GET /api/spells — resolver wiring: catalog metadata + fork-shadowing (#1798)", () => {
  // Must clean up here too — these fixture rows can leak into another suite's whole-table scan on the same worker.
  afterAll(async () => {
    await prisma.catalogEntry.deleteMany({ where: { name: { in: [DAMAGE_SPELL.name, UTILITY_SPELL.name] }, kind: "SPELL" } });
  });

  it("every row carries catalog.{entryId,scope,isFork,forkedFromId}", async () => {
    await seedFixtures();
    const response = await get("/api/spells");
    const damage = response.body.find((s: { name: string }) => s.name === DAMAGE_SPELL.name);
    expect(damage.catalog).toMatchObject({ scope: "GLOBAL", isFork: false, forkedFromId: null });
    expect(damage.catalog.entryId).toBeTypeOf("string");
  });

  it("the caller's own USER fork of a GLOBAL spell shadows the origin — only the fork is served, not both", async () => {
    const seeded = await prisma.spell.findFirstOrThrow({ where: { edition: "EDITION_2014" }, orderBy: { name: "asc" } });

    const forkRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/catalog/entries/${seeded.catalogEntryId}/fork`)
      .send({ scope: "USER" });
    expect(forkRes.status).toBe(201);
    const forkEntryId = forkRes.body.entryId as string;

    try {
      const response = await get("/api/spells", "EDITION_2014");
      const matches = response.body.filter((s: { name: string }) => s.name === seeded.name);
      expect(matches).toHaveLength(1);
      expect(matches[0].catalog).toMatchObject({
        scope: "USER",
        isFork: true,
        forkedFromId: seeded.catalogEntryId,
        entryId: forkEntryId,
      });
    } finally {
      await prisma.catalogEntry.delete({ where: { id: forkEntryId } });
    }
  });
});

// With ?characterId=, visibility resolves using the character's own campaignId/edition instead of campaignId: null, so a granted spell or DM's CAMPAIGN override reaches a fellow member's picker (#1811).
describe("GET /api/spells — ?characterId= campaign-aware picker (#1811)", () => {
  const DM_ID = "owner-spells-picker-dm";
  const MEMBER_A_ID = "owner-spells-picker-member-a";
  const MEMBER_B_ID = "owner-spells-picker-member-b";
  const OUTSIDER_ID = "owner-spells-picker-outsider";

  let cookieA: string;
  let cookieB: string;
  let cookieOutsider: string;
  let campaignId: string;
  let charMemberA: string;
  let charMemberB: string;
  let charOutsider: string;

  const createdCatalogEntryIds: string[] = [];

  async function makeCharacter(ownerId: string, campaignId: string | null): Promise<string> {
    const character = await prisma.character.create({
      data: {
        name: `Picker Test Char ${randomUUID()}`,
        alignment: "True Neutral",
        ownerId,
        campaignId,
        rulesEdition: "EDITION_2014",
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 10, max: 10, temp: 0 },
        hitDice: { total: 1, die: "d8" },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      },
      select: { id: true },
    });
    return character.id;
  }

  async function makeSpell(overrides: {
    name: string;
    scope: "USER" | "CAMPAIGN";
    ownerUserId?: string;
    ownerCampaignId?: string;
    forkedFromId?: string;
    description?: string;
  }): Promise<{ id: string; catalogEntryId: string }> {
    const catalogEntryId = await makeCatalogEntry({
      name: overrides.name,
      edition: "EDITION_2014",
      scope: overrides.scope,
      ownerUserId: overrides.ownerUserId,
      ownerCampaignId: overrides.ownerCampaignId,
      forkedFromId: overrides.forkedFromId,
    });
    createdCatalogEntryIds.push(catalogEntryId);
    const spell = await prisma.spell.create({
      data: {
        name: overrides.name,
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: overrides.description ?? "A picker-test spell.",
        edition: "EDITION_2014",
        catalogEntryId,
      },
    });
    return { id: spell.id, catalogEntryId };
  }

  beforeAll(async () => {
    await ensureTestOwner(DM_ID);
    await ensureTestOwner(MEMBER_A_ID);
    await ensureTestOwner(MEMBER_B_ID);
    await ensureTestOwner(OUTSIDER_ID);
    cookieA = await authCookie(MEMBER_A_ID);
    cookieB = await authCookie(MEMBER_B_ID);
    cookieOutsider = await authCookie(OUTSIDER_ID);

    const campaign = await prisma.campaign.create({
      data: { name: "Picker Test Campaign", ownerId: DM_ID, inviteCode: randomUUID() },
      select: { id: true },
    });
    campaignId = campaign.id;

    charMemberA = await makeCharacter(MEMBER_A_ID, campaignId);
    charMemberB = await makeCharacter(MEMBER_B_ID, campaignId);
    charOutsider = await makeCharacter(OUTSIDER_ID, null);
  });

  afterAll(async () => {
    await prisma.catalogEntry.deleteMany({ where: { id: { in: createdCatalogEntryIds } } });
    await prisma.character.deleteMany({ where: { id: { in: [charMemberA, charMemberB, charOutsider] } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [DM_ID, MEMBER_A_ID, MEMBER_B_ID, OUTSIDER_ID] } } });
  });

  it("a USER spell granted into campaign C appears for a different member's character in C, not for a character outside C", async () => {
    const name = "Test Picker Granted Bolt";
    const { catalogEntryId } = await makeSpell({ name, scope: "USER", ownerUserId: MEMBER_A_ID });
    await prisma.catalogGrant.create({ data: { catalogEntryId, campaignId } });

    const resB = await supertest.agent(app).set("Cookie", cookieB)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberB}`);
    expect(resB.status).toBe(200);
    expect(names(resB.body)).toContain(name);

    const resOutsider = await supertest.agent(app).set("Cookie", cookieOutsider)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charOutsider}`);
    expect(resOutsider.status).toBe(200);
    expect(names(resOutsider.body)).not.toContain(name);
  });

  // serializeCatalogSpellRow must not leak the granter's raw ownerUserId to a member the entry was only granted to — that would make their picker treat a shared spell as their own homebrew (#1815).
  it("does not leak the granter's ownerId to a member the entry was only GRANTED to, and marks it non-editable", async () => {
    const name = "Test Picker Granted Bolt Ownerid Leak";
    const { catalogEntryId } = await makeSpell({ name, scope: "USER", ownerUserId: MEMBER_A_ID });
    await prisma.catalogGrant.create({ data: { catalogEntryId, campaignId } });

    const resB = await supertest.agent(app).set("Cookie", cookieB)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberB}`);
    expect(resB.status).toBe(200);
    const row = resB.body.find((s: { name: string }) => s.name === name);
    expect(row).toBeDefined();
    expect(row.ownerId).toBeUndefined();
    expect(row.catalog).toMatchObject({ scope: "USER", editable: false });
  });

  it("a DM's CAMPAIGN homebrew appears in members' pickers for characters in that campaign", async () => {
    const name = "Test Picker DM Campaign Spell";
    await makeSpell({ name, scope: "CAMPAIGN", ownerCampaignId: campaignId });

    const resA = await supertest.agent(app).set("Cookie", cookieA)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberA}`);
    expect(resA.status).toBe(200);
    expect(names(resA.body)).toContain(name);

    const resOutsider = await supertest.agent(app).set("Cookie", cookieOutsider)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charOutsider}`);
    expect(resOutsider.status).toBe(200);
    expect(names(resOutsider.body)).not.toContain(name);
  });

  it("fork shadowing still applies in the picker — a DM's CAMPAIGN fork shadows a granted USER origin for a non-owning member", async () => {
    const name = "Test Picker Shadowed Bolt";
    const origin = await makeSpell({
      name,
      scope: "USER",
      ownerUserId: MEMBER_A_ID,
      description: "The origin author's version.",
    });
    await prisma.catalogGrant.create({ data: { catalogEntryId: origin.catalogEntryId, campaignId } });
    const fork = await makeSpell({
      name,
      scope: "CAMPAIGN",
      ownerCampaignId: campaignId,
      forkedFromId: origin.catalogEntryId,
      description: "The DM's overriding version.",
    });

    const res = await supertest.agent(app).set("Cookie", cookieB)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberB}`);
    expect(res.status).toBe(200);
    const matches = res.body.filter((s: { name: string }) => s.name === name);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(fork.id);
    expect(matches[0].description).toBe("The DM's overriding version.");
  });

  it("with no ?characterId= the response is unchanged — a campaign-granted spell stays invisible even to a campaign member", async () => {
    const name = "Test Picker No Character Param Bolt";
    const { catalogEntryId } = await makeSpell({ name, scope: "USER", ownerUserId: MEMBER_A_ID });
    await prisma.catalogGrant.create({ data: { catalogEntryId, campaignId } });

    const res = await supertest.agent(app).set("Cookie", cookieB).get("/api/spells?edition=EDITION_2014");
    expect(res.status).toBe(200);
    expect(names(res.body)).not.toContain(name);
  });

  it("403s when ?characterId= names a character the caller does not own", async () => {
    const res = await supertest.agent(app).set("Cookie", cookieB)
      .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberA}`);
    expect(res.status).toBe(403);
  });

  it("404s when ?characterId= names a character that does not exist", async () => {
    const res = await supertest.agent(app).set("Cookie", cookieB)
      .get(`/api/spells?edition=EDITION_2014&characterId=${randomUUID()}`);
    expect(res.status).toBe(404);
  });

  // catalog.editable (isCatalogEntryEditable) is what the client gates Edit/Delete on, not scope === "CAMPAIGN" alone (#1808).
  describe("catalog.editable authorization signal", () => {
    let cookieDm: string;
    let charDm: string;

    beforeAll(async () => {
      cookieDm = await authCookie(DM_ID);
      await prisma.campaignMembership.upsert({
        where: { campaignId_userId: { campaignId, userId: DM_ID } },
        create: { campaignId, userId: DM_ID, role: "OWNER" },
        update: { role: "OWNER" },
      });
      charDm = await makeCharacter(DM_ID, campaignId);
    });

    afterAll(async () => {
      await prisma.character.deleteMany({ where: { id: charDm } });
      await prisma.campaignMembership.deleteMany({ where: { campaignId, userId: DM_ID } });
    });

    it("a DM's own CAMPAIGN fork is editable for the DM, not for a fellow (non-DM) member", async () => {
      const name = "Test Picker Editable DM Fork";
      await makeSpell({ name, scope: "CAMPAIGN", ownerCampaignId: campaignId });

      const resDm = await supertest.agent(app).set("Cookie", cookieDm)
        .get(`/api/spells?edition=EDITION_2014&characterId=${charDm}`);
      expect(resDm.status).toBe(200);
      const dmRow = resDm.body.find((s: { name: string }) => s.name === name);
      expect(dmRow?.catalog?.editable).toBe(true);

      const resA = await supertest.agent(app).set("Cookie", cookieA)
        .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberA}`);
      expect(resA.status).toBe(200);
      const memberRow = resA.body.find((s: { name: string }) => s.name === name);
      expect(memberRow?.catalog?.editable).toBe(false);
    });

    it("a USER-scope entry granted into the campaign is editable only for its own author", async () => {
      const name = "Test Picker Editable USER Row";
      const { catalogEntryId } = await makeSpell({ name, scope: "USER", ownerUserId: MEMBER_A_ID });
      await prisma.catalogGrant.create({ data: { catalogEntryId, campaignId } });

      const resA = await supertest.agent(app).set("Cookie", cookieA)
        .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberA}`);
      const aRow = resA.body.find((s: { name: string }) => s.name === name);
      expect(aRow?.catalog?.editable).toBe(true);

      const resB = await supertest.agent(app).set("Cookie", cookieB)
        .get(`/api/spells?edition=EDITION_2014&characterId=${charMemberB}`);
      const bRow = resB.body.find((s: { name: string }) => s.name === name);
      expect(bRow?.catalog?.editable).toBe(false);
    });

    it("a GLOBAL entry is never editable, even for a campaign's DM", async () => {
      const resDm = await supertest.agent(app).set("Cookie", cookieDm)
        .get(`/api/spells?edition=EDITION_2014&characterId=${charDm}`);
      expect(resDm.status).toBe(200);
      const globalRow = resDm.body.find((s: { catalog?: { scope: string } }) => s.catalog?.scope === "GLOBAL");
      expect(globalRow).toBeDefined();
      expect(globalRow.catalog.editable).toBe(false);
    });
  });
});
