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

// A fully-populated damage spell (every nullable effect column set) and a bare
// utility cantrip (all effect columns null) — together they exercise both sides
// of each `?? undefined` fallback in the row mapper. `classes` (#1711) is no
// longer a Spell column — kept here only as the fixture's OWN membership list,
// written into SpellClass by seedFixtures below.
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

// Writes one SpellClass row per className, proving the served `classes: [...]`
// comes entirely off the join (#1711) — the Spell row itself carries no
// membership data at all.
async function seedSpellClasses(spellId: string, classNames: string[]) {
  for (const className of classNames) {
    await prisma.spellClass.upsert({
      where: { spellId_className: { spellId, className } },
      create: { spellId, className },
      update: {},
    });
  }
}

// upsertEditionRow, not .upsert(): Spell's business key is now (name,
// edition) (#1710), and these fixture spells are edition-neutral.
// catalogEntryId (#1796) is resolved first via makeCatalogEntry (find-then-
// create, so a second call across tests reuses rather than colliding) —
// required, no default.
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

// `?edition=` is now REQUIRED (#1712) — every existing call in this file
// exercises `?class=`/`?maxLevel=`/membership behavior, not the edition gate
// itself, so this helper appends a default edition rather than touching every
// call site. The dedicated 400/fork describe blocks below call supertest
// directly (or pass an explicit edition) where the param IS the thing under test.
function get(path: string, edition: string = "EDITION_2024") {
  const sep = path.includes("?") ? "&" : "?";
  return supertest.agent(app).set("Cookie", COOKIE).get(`${path}${sep}edition=${edition}`);
}

// Homebrew tests (#1786) need to vary WHICH user's cookie is attached — get()
// above always uses the module-level OWNER_ID cookie.
function getAs(cookie: string, path: string, edition: string = "EDITION_2014") {
  const sep = path.includes("?") ? "&" : "?";
  return supertest.agent(app).set("Cookie", cookie).get(`${path}${sep}edition=${edition}`);
}

function names(body: { name: string }[]): string[] {
  return body.map((s) => s.name);
}

describe("GET /api/spells", () => {
  afterAll(async () => {
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796) — the reverse cascade doesn't exist (the supertype stays
    // closed), so a plain `spell.deleteMany` alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: { in: [DAMAGE_SPELL.name, UTILITY_SPELL.name] }, kind: "SPELL" } });
  });

  it("returns the spell catalog ordered by level then name, mapping effect fields", async () => {
    await seedFixtures();

    const response = await get("/api/spells");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Ordered by level asc, then name asc.
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

    // The utility cantrip leaves every effect column null → the mapper's
    // `?? undefined` collapses them so JSON omits the keys entirely.
    const utility = response.body.find((s: { name: string }) => s.name === UTILITY_SPELL.name);
    expect(utility).toMatchObject({ level: 0, school: "divination", concentration: true, cantripScaling: true });
    expect(utility.effectKind).toBeUndefined();
    expect(utility.damageType).toBeUndefined();
    expect(utility.saveAbility).toBeUndefined();
    expect(utility.upcastDicePerLevel).toBeUndefined();
  });
});

// #1377: the creation ceremony's eligibility rule — on the class's list, inside
// the legal level band — is applied here so the client never re-derives it. The
// two fixtures above are already the pair this needs: DAMAGE_SPELL is level 2
// wizard/sorcerer, UTILITY_SPELL is level 0 cleric/druid.
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

// #1631: a chosen subclass's list-expansion widens `?class=`'s own membership
// filter — over the REAL seeded Fiend subclass + catalog spells, same "link
// against live seed content" style as granted-spells-domains.test.ts.
describe("GET /api/spells — ?subclassId= list-expansion widening (#1631)", () => {
  it("a 2014 Fiend Warlock's ?subclassId= adds Burning Hands, off the base Warlock list", async () => {
    const warlock = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Warlock" }, select: { id: true } });
    const fiend = await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" }, select: { id: true } });

    const withoutSubclass = await get(`/api/spells?class=warlock&maxLevel=1`, "EDITION_2014");
    expect(names(withoutSubclass.body)).not.toContain("Burning Hands");

    const withSubclass = await get(`/api/spells?class=warlock&maxLevel=1&subclassId=${fiend.id}`, "EDITION_2014");
    expect(withSubclass.status).toBe(200);
    expect(names(withSubclass.body)).toContain("Burning Hands");
    // Only WIDENS — every base-list spell the unwidened request served is
    // still present.
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

// #1711: membership is served entirely off the SpellClass join now — Spell
// itself carries no `classes` column at all — so a membership row's own
// lifecycle (add/remove), not any Spell field, is what the route reflects.
describe("GET /api/spells — class membership served from the SpellClass join (#1711)", () => {
  afterAll(async () => {
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796) — the reverse cascade doesn't exist (the supertype stays
    // closed), so a plain `spell.deleteMany` alone would orphan the entry.
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

// #1712: `?edition=` is now REQUIRED — reverses #1377's "no ?edition=" (the
// docstring this route carried at spells.ts:18 before this slice). Absent and
// unrecognized both 400, matching featsRouter/referenceRouter's precedent
// (#1411/#1412) exactly, including the two distinct messages.
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

// #1712/#1372/#1753: the real plumbing proof — a GENUINE 2014/2024 fork
// (same name, two rows) must resolve to exactly ONE row per requesting
// edition, and a lone single-edition-tagged row with NO sibling is served
// ONLY to its own edition (#1372/#1753 retired the earlier "serve the
// group's one remaining row to either edition" grace #1712 added for the
// pre-#1713-#1721 mid-migration catalog — see resolveSpellCatalogForEdition's
// own comment for the full history).
describe("GET /api/spells — genuine edition fork resolves to one row per edition (#1712)", () => {
  const FORK_NAME = "Test Fork Catalog Spell";
  // Distinct from FORK_NAME: the first test above leaves a real 2014 row
  // behind for FORK_NAME (afterAll only cleans up at the end of the block),
  // so a test that needs to start from "no 2014 sibling yet" needs its own name.
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
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796) — the reverse cascade doesn't exist (the supertype stays
    // closed), so a plain `spell.deleteMany` alone would orphan the entry.
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

    // No 2014 sibling yet: the lone 2024 row is absent from a 2014 request
    // (#1372/#1753 — no more "serve it anyway" grace)...
    const before2014 = await get("/api/spells", "EDITION_2014");
    expect(names(before2014.body)).not.toContain(LATE_FORK_NAME);
    // ...and still present in its own edition's response.
    const before2024 = await get("/api/spells", "EDITION_2024");
    expect(names(before2024.body)).toContain(LATE_FORK_NAME);

    // Once a real 2014 sibling lands, the fork is genuine and exact-match
    // wins — same end state, reached without ever passing through the
    // retired fallback.
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

  // #1372/#1753: the mirror direction — this is the half of the symmetric
  // leak that actually broke "2024 stays curated" once #1713-#1721 seeded
  // ~350 lone EDITION_2014 rows (the bulk of the 2014-only breadth): every
  // one of them was also reaching a 2024 request before this fix.
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
      // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
      // #1796) — the reverse cascade doesn't exist, so a plain
      // `spell.deleteMany` alone would orphan the entry.
      await prisma.catalogEntry.deleteMany({ where: { name: LONE_2014_NAME, kind: "SPELL" } });
    }
  });

  // #1715: the real-world case that exposed this — 2014 Command is
  // cleric+paladin only, but the 2024 SRD 5.2 revision added bard to its
  // list. `?class=bard` must resolve the RIGHT edition's row first and check
  // ITS OWN class list, not fetch whichever edition's row happens to carry a
  // "bard" SpellClass membership and serve that one regardless of edition.
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
      // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
      // #1796) — the reverse cascade doesn't exist, so a plain
      // `spell.deleteMany` alone would orphan the entry.
      await prisma.catalogEntry.deleteMany({ where: { name: DIVERGENT_NAME, kind: "SPELL" } });
    }
  });
});

// #1786, epic #1782 3/5: a user's own homebrew — a `scope: "USER"`
// CatalogEntry (#1796 replaced Spell.ownerId with the entitlement supertype)
// — flows through the same route as seeded spells, scoped so only its owner
// ever sees it — the cross-user isolation test is the load-bearing one here.
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

  // Created once here, not inside the first `it` below: the isolation test
  // (B must NOT see it) and the edition test (2024 must NOT see it) both
  // assert `.not.toContain`, which would pass VACUOUSLY — for the wrong
  // reason — if this fixture didn't already exist independent of test
  // order/`.only`. All three tests below share this one row.
  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    cookieA = await authCookie(OWNER_A);
    cookieB = await authCookie(OWNER_B);
    await createHomebrew(OWNER_A);
  });

  afterAll(async () => {
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796); deleting the User cascades their remaining USER-scope entries
    // too, so this is belt-and-suspenders — but explicit, not relied on.
    await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it("a user's own homebrew appears in their own EDITION_2014 catalog", async () => {
    const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
    expect(res.status).toBe(200);
    expect(names(res.body)).toContain(HOMEBREW_NAME);
  });

  // #1788, epic #1782 5/5: the manage UI's only signal for "mine, offer
  // edit/delete" — ownerId must be present on the caller's own row AND never
  // present-but-someone-else's on any other row this response serves.
  it("serves ownerId on the caller's own homebrew row, and never a different owner's id on any row", async () => {
    const res = await getAs(cookieA, "/api/spells", "EDITION_2014");
    const homebrewRow = res.body.find((s: { name: string }) => s.name === HOMEBREW_NAME);
    expect(homebrewRow.ownerId).toBe(OWNER_A);

    // Finding one row that lacks ownerId (seeded) proves nothing about
    // whether some OTHER row carries a different owner's id — assert the
    // cross-user-leak invariant directly across every row served, not just
    // the fixture's own row.
    const ownedRows = res.body.filter((s: { ownerId?: string }) => s.ownerId !== undefined);
    expect(ownedRows.length).toBeGreaterThan(0);
    expect(ownedRows.every((s: { ownerId?: string }) => s.ownerId === OWNER_A)).toBe(true);
  });

  // #1788, epic #1782 5/5: saveEffect was written by customSpellSchema since
  // #1787 but never served back here — the manage view's "Edit" prefill is
  // the first caller that needs it round-tripped, so a "half damage on save"
  // choice doesn't silently vanish when a homebrew spell is edited.
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
    // The CatalogEntry's own edition must match the request (#1798, epic
    // #1795 3/6): the resolver filters GLOBAL visibility by
    // CatalogEntry.edition, unlike the retired interim filter it replaces —
    // the Spell row itself stays edition: null (SharedSpell semantics,
    // untouched by this slice).
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

// #1798, epic #1795 3/6: the resolver (entitlement.ts) now drives this route
// in place of the interim two-query owner filter — these two behaviors are
// exactly what the interim never had (no fork/shadow awareness at all) and
// what the interim's response never carried (SpellWire.catalog, locked in
// slice 1 but left unpopulated here until now).
describe("GET /api/spells — resolver wiring: catalog metadata + fork-shadowing (#1798)", () => {
  // Missing cleanup here left "Test Firebolt Catalog"/"Test Guidance Catalog"
  // in the shared vitest-worker database for the rest of the suite (every
  // other describe block in this file re-seeds and re-cleans the same pair,
  // but this was the one block that didn't) — a whole-table-scan test running
  // later on the same worker (catalog-seed.integration.test.ts, #1796) saw
  // them and failed on a foreign row it never created.
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

// #1811, epic #1795 9/9: `?characterId=` gives the learn picker CAMPAIGN
// context — with no characterId every test above stays exactly as it was
// (GLOBAL + own USER only); with one, visibility resolves through the SAME
// resolver (entitlement.ts) for `{ userId: caller, campaignId: <character's
// campaign>, edition: <character's own edition> }` instead of `campaignId:
// null`, so a spell shared/granted into the character's campaign — or a DM's
// CAMPAIGN override — reaches a fellow member's picker.
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

  // Bare-minimum Spell row for a CatalogEntry — mirrors createHomebrew above,
  // parameterized over scope/owner so this block can seed USER and CAMPAIGN
  // rows (and forks of either) without a bespoke helper per scope.
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
    // No DM cookie: these tests never authenticate as the DM — DM_ID exists
    // only as the campaign's ownerId and the CAMPAIGN-scope fixture rows'
    // ownerCampaignId, both written directly via prisma (a real DM override
    // would go through fork.ts, already covered by fork.test.ts).
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

  // #1815 review finding 2: GET /api/spells used to serve `ownerId` as the
  // ENTRY's raw ownerUserId unconditionally — for this exact granted row
  // that's MEMBER_A's id, leaked to MEMBER_B's response. `ownerId` is the
  // manage view's own "mine, offer edit/delete" signal (see
  // serializeCatalogSpellRow's comment); leaking it here made MEMBER_B's
  // picker treat MEMBER_A's shared spell as MEMBER_B's OWN homebrew — hiding
  // the Fork button, showing Edit/Delete that then 403 on click, and
  // labeling it "My homebrew" instead of "Shared homebrew".
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

  // #1808 leak-fix, epic #1795 8/9 combined-state review: #1811 (this block)
  // started serving a CAMPAIGN row to every campaign member, not just its
  // DM — `catalog.editable` (isCatalogEntryEditable, lib/catalog/
  // entitlement.ts) is what the client now gates Edit/Delete on instead of
  // `scope === "CAMPAIGN"` alone. The outer beforeAll deliberately never
  // makes DM_ID a real CampaignMembership row (this file's own comment
  // there), so this block builds its own DM membership + character.
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
