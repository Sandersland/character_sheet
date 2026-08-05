import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
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
async function seedFixtures() {
  const damage = await upsertEditionRow(prisma.spell, { name: DAMAGE_SPELL.name, edition: null }, { ...DAMAGE_SPELL, edition: null }, DAMAGE_SPELL);
  const utility = await upsertEditionRow(prisma.spell, { name: UTILITY_SPELL.name, edition: null }, { ...UTILITY_SPELL, edition: null }, UTILITY_SPELL);
  await seedSpellClasses(damage.id, DAMAGE_SPELL_CLASSES);
  await seedSpellClasses(utility.id, UTILITY_SPELL_CLASSES);
}

function get(path: string) {
  return supertest.agent(app).set("Cookie", COOKIE).get(path);
}

function names(body: { name: string }[]): string[] {
  return body.map((s) => s.name);
}

describe("GET /api/spells", () => {
  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: { in: [DAMAGE_SPELL.name, UTILITY_SPELL.name] } } });
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

// #1711: membership is served entirely off the SpellClass join now — Spell
// itself carries no `classes` column at all — so a membership row's own
// lifecycle (add/remove), not any Spell field, is what the route reflects.
describe("GET /api/spells — class membership served from the SpellClass join (#1711)", () => {
  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: DAMAGE_SPELL.name } });
  });

  it("a class only reaches the response after its SpellClass row exists, and stops after it's removed", async () => {
    const damage = await upsertEditionRow(prisma.spell, { name: DAMAGE_SPELL.name, edition: null }, { ...DAMAGE_SPELL, edition: null }, DAMAGE_SPELL);

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
    const damage = await upsertEditionRow(prisma.spell, { name: DAMAGE_SPELL.name, edition: null }, { ...DAMAGE_SPELL, edition: null }, DAMAGE_SPELL);
    await prisma.spellClass.create({ data: { spellId: damage.id, className: "wizard" } });

    await prisma.spell.delete({ where: { id: damage.id } });

    expect(await prisma.spellClass.findMany({ where: { spellId: damage.id } })).toEqual([]);
  });
});
