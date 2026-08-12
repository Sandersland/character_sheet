import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";

const OWNER_ID = "owner-level-up-tx";
let COOKIE: string;

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function post(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/level-up/transactions`)
    .set("Cookie", COOKIE)
    .send(body);
}

function getPlan(characterId: string) {
  return supertest(app).get(`/api/characters/${characterId}/level-up/plan`).set("Cookie", COOKIE);
}

// The distinct batchId a single level-up request must group all its events under.
async function distinctBatchIds(characterId: string): Promise<string[]> {
  const events = await prisma.characterEvent.findMany({ where: { characterId }, select: { batchId: true } });
  return [...new Set(events.map((e) => e.batchId).filter((b): b is string => Boolean(b)))];
}

async function eventCategories(characterId: string): Promise<string[]> {
  const events = await prisma.characterEvent.findMany({ where: { characterId }, select: { category: true } });
  return events.map((e) => e.category);
}

function eventCount(characterId: string): Promise<number> {
  return prisma.characterEvent.count({ where: { characterId } });
}

// The batchId of the most-recent non-revert event, via the public activity
// timeline (desc order) — mirrors activity.test.ts's latestBatchId helper.
async function latestBatchId(characterId: string): Promise<string> {
  const res = await supertest(app).get(`/api/characters/${characterId}/activity`).set("Cookie", COOKIE);
  expect(res.status).toBe(200);
  const events = res.body as Array<{ batchId?: string; type: string }>;
  const ev = events.find((e) => e.type !== "revert" && e.batchId);
  if (!ev?.batchId) throw new Error("no batchId found on the activity timeline");
  return ev.batchId;
}

function revert(characterId: string, batchId: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/events/${batchId}/revert`)
    .set("Cookie", COOKIE)
    .send();
}

// A distinct second owner for the foreign-access (403) case.
const OWNER_ID_2 = "owner-level-up-tx-2";
let COOKIE_2: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await ensureTestOwner(OWNER_ID_2);
  COOKIE = await authCookie(OWNER_ID);
  COOKIE_2 = await authCookie(OWNER_ID_2);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "LevelUpTx" } } });
});
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "LevelUpTx" } } });
});

describe("POST /api/characters/:id/level-up/transactions — Fighter 7→8 (hp + ASI)", () => {
  let fighterClassId: string;
  const CHAR_ID = "lvtx-fighter-8";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    fighterClassId = fighter.id;
    const champion = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterClassId, name: "Champion" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Fighter",
        experiencePoints: 34000, // level 8 threshold
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: "Champion", subclassId: champion, classId: fighterClassId, position: 0, level: 7 }],
        },
      },
    });
  });

  it("applies hp + ASI under one batchId and returns the leveled character", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });

    expect(res.status).toBe(200);
    // Fighter d10 average = floor(10/2)+1 = 6; conMod +2 → +8 max HP. ASI bumps
    // strength (not con) so HP gain is the level-up gain alone.
    expect(res.body.hitDice.total).toBe(8);
    expect(res.body.hitPoints.max).toBe(68);
    expect(res.body.abilityScores.strength).toBe(16);

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("advancement");
  });

  it("400s when a required advancement step is missing (route wires validation)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // No `advancement` — Fighter L8 grants an ASI, so validation must reject.
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/advancement|ability score/i);
  });
});

describe("POST /api/characters/:id/level-up/transactions — Battle Master ceremony (Fighter 2→3)", () => {
  const CHAR_ID = "lvtx-battlemaster-3";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Battle Master",
        experiencePoints: 900, // level 3 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 2 }],
        },
      },
    });
  });

  it("sets subclass + 3 maneuvers + tool proficiency under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });
    expect(maneuvers).toHaveLength(3);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.classes[0].subclass).toBe("Battle Master");
    expect(res.body.resources.maneuversKnown).toHaveLength(3);
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).toContain("Smith's Tools");

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("class");
    expect(categories).toContain("resources");

    // The subclass drifted onto the persisted primary entry (not just the response).
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted.subclass).toBe("Battle Master");
  });
});

// #1825 Finding 1: an Eldritch Knight's cantripLists is ["wizard"], not its
// base "fighter" list, so a rejected cantrip must name the WIZARD cantrip list
// (via classListPhrase), never the base class the old message hardcoded.
describe("POST /api/characters/:id/level-up/transactions — Eldritch Knight ceremony (Fighter 2→3)", () => {
  const CHAR_ID = "lvtx-eldritch-knight-3";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Eldritch Knight",
        experiencePoints: 900, // level 3 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 2 }],
        },
      },
    });
  });

  it("rejects a non-wizard cantrip naming the WIZARD cantrip list, not the base fighter class", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const eldritchKnight = await prisma.subclass.findFirstOrThrow({ where: { name: "Eldritch Knight" }, select: { id: true } });
    const wizardCantrip = await prisma.spell.findFirstOrThrow({
      where: { level: 0, edition: "EDITION_2024", classMemberships: { some: { className: "wizard" } } },
      select: { id: true },
    });
    // A cleric cantrip that is NOT on the wizard list — the ineligible pick.
    const clericCantrip = await prisma.spell.findFirstOrThrow({
      where: { level: 0, edition: "EDITION_2024", classMemberships: { some: { className: "cleric" }, none: { className: "wizard" } } },
      select: { id: true, name: true },
    });
    const wizardSpells = await prisma.spell.findMany({
      where: { level: 1, edition: "EDITION_2024", classMemberships: { some: { className: "wizard" } } },
      orderBy: { name: "asc" },
      take: 3,
      select: { id: true },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: eldritchKnight.id,
      cantripsLearned: [
        { type: "learnSpell", spellId: wizardCantrip.id },
        { type: "learnSpell", spellId: clericCantrip.id },
      ],
      spellsLearned: wizardSpells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${clericCantrip.name} is not on the Wizard cantrip list.`);
  });
});

// #1855: PHB'14 p. 74 Eldritch Knight Spellcasting — leveled picks (never
// cantrips) are gated to Abjuration/Evocation, except one free any-school pick
// at fighter level 3, 8, 14, and 20. SRD 5.1 has no Eldritch Knight; PHB'24
// dropped the restriction, so a 2024 EK stays unaffected.
describe("POST /api/characters/:id/level-up/transactions — Eldritch Knight spell-school gate (2014, #1855)", () => {
  let fighterClassId: string;
  let eldritchKnightId: string;

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    fighterClassId = fighter.id;
    eldritchKnightId = (await prisma.subclass.findFirstOrThrow({ where: { name: "Eldritch Knight" }, select: { id: true } })).id;
  });

  async function makeEldritchKnight(
    id: string,
    opts: { edition: "EDITION_2014" | "EDITION_2024"; hitDiceTotal: number; xp: number },
  ): Promise<string> {
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id,
        name: "LevelUpTx EldritchSchool",
        rulesEdition: opts.edition,
        experiencePoints: opts.xp,
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: opts.hitDiceTotal, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{
            name: "fighter",
            subclass: "Eldritch Knight",
            subclassId: eldritchKnightId,
            classId: fighterClassId,
            position: 0,
            level: opts.hitDiceTotal,
          }],
        },
      },
    });
    return (await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } })).id;
  }

  // Fighter 3→4 and 7→8 both cross a universal ASI level (advancement-slots.ts's
  // BASE_ASI_LEVELS = [4, 8, 12, 16, 19]) — every ordinary-level test below
  // carries a `takeAsi` op so the count-check (validateLevelUpSubmission)
  // doesn't 400 before the school gate this suite is actually exercising ever
  // runs. Wisdom, never Intelligence, so it never perturbs the third-caster
  // spellcasting ability these fixtures otherwise hold fixed.
  const ORDINARY_ASI = { type: "takeAsi" as const, increases: [{ ability: "wisdom" as const, amount: 2 }] };

  it("2014 EK 3→4: rejects a non-Abjuration/Evocation pick at an ordinary level (no free pick left)", async () => {
    const entryId = await makeEldritchKnight("lvtx-ek-school-4", { edition: "EDITION_2014", hitDiceTotal: 3, xp: 2700 });
    // Detect Magic (divination) — not Abjuration/Evocation, and this level's
    // single pick (THIRD_CASTER_PREPARED 3→4 delta) carries no free pick.
    const detectMagic = await prisma.spell.findFirstOrThrow({
      where: { name: "Detect Magic", edition: "EDITION_2014" },
      select: { id: true, name: true },
    });

    const res = await post("lvtx-ek-school-4", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: ORDINARY_ASI,
      spellsLearned: [{ type: "learnSpell", spellId: detectMagic.id }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${detectMagic.name} must be an Abjuration or Evocation spell.`);
    expect(await eventCount("lvtx-ek-school-4")).toBe(0);
  });

  it("2014 EK 3→4: an Abjuration or Evocation pick succeeds at an ordinary level", async () => {
    const entryId = await makeEldritchKnight("lvtx-ek-school-ok4", { edition: "EDITION_2014", hitDiceTotal: 3, xp: 2700 });
    const mageArmor = await prisma.spell.findFirstOrThrow({
      where: { name: "Mage Armor", edition: "EDITION_2014" },
      select: { id: true, name: true },
    });

    const res = await post("lvtx-ek-school-ok4", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: ORDINARY_ASI,
      spellsLearned: [{ type: "learnSpell", spellId: mageArmor.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.spellcasting.spells.map((s: { name: string }) => s.name)).toContain(mageArmor.name);
  });

  it("2014 EK fresh 2→3: 2-of-3 rule — two Abjuration/Evocation picks + one free any-school pick succeeds", async () => {
    const fighter2 = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const CHAR_ID = "lvtx-ek-school-3of3";
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx EldritchSchool",
        rulesEdition: "EDITION_2014",
        experiencePoints: 900, // level 3 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "fighter", subclass: null, classId: fighter2.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const mageArmor = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Armor", edition: "EDITION_2014" }, select: { id: true } });
    const magicMissile = await prisma.spell.findFirstOrThrow({ where: { name: "Magic Missile", edition: "EDITION_2014" }, select: { id: true } });
    const detectMagic = await prisma.spell.findFirstOrThrow({ where: { name: "Detect Magic", edition: "EDITION_2014" }, select: { id: true, name: true } });
    // The fresh 3rd-level grant also carries 2 cantrips (THIRD_CASTER_CANTRIPS) —
    // cantrips are unrestricted, so any two wizard cantrips satisfy the count.
    const mageHand = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Hand", edition: "EDITION_2014" }, select: { id: true } });
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2014" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: eldritchKnightId,
      cantripsLearned: [
        { type: "learnSpell", spellId: mageHand.id },
        { type: "learnSpell", spellId: fireBolt.id },
      ],
      spellsLearned: [
        { type: "learnSpell", spellId: mageArmor.id },
        { type: "learnSpell", spellId: magicMissile.id },
        { type: "learnSpell", spellId: detectMagic.id },
      ],
    });

    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(detectMagic.name);
  });

  it("2014 EK fresh 2→3: a SECOND off-school pick exceeds the one free slot and is rejected", async () => {
    const fighter2 = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const CHAR_ID = "lvtx-ek-school-2of3-fail";
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx EldritchSchool",
        rulesEdition: "EDITION_2014",
        experiencePoints: 900,
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "fighter", subclass: null, classId: fighter2.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const mageArmor = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Armor", edition: "EDITION_2014" }, select: { id: true } });
    const detectMagic = await prisma.spell.findFirstOrThrow({ where: { name: "Detect Magic", edition: "EDITION_2014" }, select: { id: true } });
    const charmPerson = await prisma.spell.findFirstOrThrow({ where: { name: "Charm Person", edition: "EDITION_2014" }, select: { id: true, name: true } });
    const mageHand = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Hand", edition: "EDITION_2014" }, select: { id: true } });
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2014" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: eldritchKnightId,
      cantripsLearned: [
        { type: "learnSpell", spellId: mageHand.id },
        { type: "learnSpell", spellId: fireBolt.id },
      ],
      spellsLearned: [
        { type: "learnSpell", spellId: mageArmor.id },
        { type: "learnSpell", spellId: detectMagic.id },
        { type: "learnSpell", spellId: charmPerson.id },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${charmPerson.name} must be an Abjuration or Evocation spell.`);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("2014 EK 7→8: the free any-school pick at fighter level 8 admits an off-school spell", async () => {
    const entryId = await makeEldritchKnight("lvtx-ek-school-8", { edition: "EDITION_2014", hitDiceTotal: 7, xp: 34000 });
    const detectMagic = await prisma.spell.findFirstOrThrow({ where: { name: "Detect Magic", edition: "EDITION_2014" }, select: { id: true, name: true } });

    const res = await post("lvtx-ek-school-8", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: ORDINARY_ASI,
      spellsLearned: [{ type: "learnSpell", spellId: detectMagic.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.spellcasting.spells.map((s: { name: string }) => s.name)).toContain(detectMagic.name);
  });

  it("2014 EK cantrips are unrestricted by school even when every leveled pick is gated", async () => {
    const CHAR_ID = "lvtx-ek-school-cantrip";
    const fighter2 = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx EldritchSchool",
        rulesEdition: "EDITION_2014",
        experiencePoints: 900,
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "fighter", subclass: null, classId: fighter2.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Both wizard cantrips off the Abjuration/Evocation gate entirely (conjuration, illusion).
    const mageHand = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Hand", edition: "EDITION_2014" }, select: { id: true } });
    const minorIllusion = await prisma.spell.findFirstOrThrow({ where: { name: "Minor Illusion", edition: "EDITION_2014" }, select: { id: true } });
    const mageArmor = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Armor", edition: "EDITION_2014" }, select: { id: true } });
    const magicMissile = await prisma.spell.findFirstOrThrow({ where: { name: "Magic Missile", edition: "EDITION_2014" }, select: { id: true } });
    const detectMagic = await prisma.spell.findFirstOrThrow({ where: { name: "Detect Magic", edition: "EDITION_2014" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: eldritchKnightId,
      cantripsLearned: [
        { type: "learnSpell", spellId: mageHand.id },
        { type: "learnSpell", spellId: minorIllusion.id },
      ],
      spellsLearned: [
        { type: "learnSpell", spellId: mageArmor.id },
        { type: "learnSpell", spellId: magicMissile.id },
        { type: "learnSpell", spellId: detectMagic.id },
      ],
    });

    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain("Mage Hand");
    expect(names).toContain("Minor Illusion");
  });

  // Mutation-proof: if the EDITION_2014/EDITION_2024 gate in
  // eldritchKnightSpellSchoolGate were dropped (always restricting), this
  // 2024 EK's off-school picks would 400 and this test would go red.
  it("2024 EK 3→4 is unaffected — no school restriction at all", async () => {
    const entryId = await makeEldritchKnight("lvtx-ek-school-2024", { edition: "EDITION_2024", hitDiceTotal: 3, xp: 2700 });
    const detectMagic = await prisma.spell.findFirstOrThrow({ where: { name: "Detect Magic", edition: "EDITION_2024" }, select: { id: true, name: true } });

    const res = await post("lvtx-ek-school-2024", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: ORDINARY_ASI,
      spellsLearned: [{ type: "learnSpell", spellId: detectMagic.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.spellcasting.spells.map((s: { name: string }) => s.name)).toContain(detectMagic.name);
  });
});

// #1497: at 2014 exhaustion 4+ (PHB'14 p. 291), `hitPoints.max` is already the
// halved EFFECTIVE max — the GET /plan preview and the actual commit must
// agree on the post-level max WITHOUT the client re-deriving the halving
// (which depends on the pre-halving max's own parity, unrecoverable from the
// served halved max alone). This drives both endpoints for real, over the
// SAME character, and asserts they produce the identical number.
describe("POST /api/characters/:id/level-up/transactions — 2014 exhaustion 4+ HP preview matches the commit (#1497)", () => {
  const CHAR_ID = "lvtx-exhaustion4-hp";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Exhausted Fighter",
        rulesEdition: "EDITION_2014",
        experiencePoints: 6500, // level 5 threshold — not an ASI level, so `average` alone is valid
        // Odd pre-halving max (31) — the parity the addition-based preview used
        // to get wrong; Con 14 → +2 modifier.
        hitPoints: { current: 31, max: 31, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 4, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        conditions: { active: [], exhaustion: 4 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 4 }],
        },
      },
    });
  });

  it("the plan's effectiveMaxAverage equals the levelUp op's actual committed max — not `servedMax + gain`", async () => {
    const plan = await getPlan(CHAR_ID);
    expect(plan.status).toBe(200);
    const hpStep = (plan.body.steps as { kind: string; meta?: Record<string, unknown> }[]).find((s) => s.kind === "hitPoints");
    const effectiveMaxAverage = hpStep?.meta?.effectiveMaxAverage;
    expect(typeof effectiveMaxAverage).toBe("number");

    // The bug this closes: naively adding the gain to the ALREADY-HALVED served
    // max (31 + 8 = 39) is NOT the real answer — the halving itself grows with
    // the new (pre-halving) max, and that max's parity flips the rounding.
    expect(effectiveMaxAverage).not.toBe(31 + 8);

    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, { target: { kind: "existing", classEntryId: entry.id }, hp: { method: "average" } });
    expect(res.status).toBe(200);
    // newRawMax = 31 + (floor(10/2)+1+2) = 31 + 8 = 39; halved (round up
    // subtracted, PHB'14 p. 7) = 39 - 20 = 19.
    expect(res.body.hitPoints.max).toBe(19);
    expect(res.body.hitPoints.max).toBe(effectiveMaxAverage);
  });
});

describe("POST /api/characters/:id/level-up/transactions — Wizard 3→4 (hp + ASI + spells)", () => {
  const CHAR_ID = "lvtx-wizard-4";

  beforeEach(async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Wizard",
        experiencePoints: 2700, // level 4 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });
  });

  it("learns 2 spells + 1 cantrip alongside hp + ASI under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "wizard" } }, level: { gt: 0, lte: 2 }, edition: "EDITION_2024" }, orderBy: { level: "asc" }, take: 2, select: { id: true, name: true } });
    expect(spells).toHaveLength(2);
    // #1131: wizard gains its 4th cantrip at level 4, so the newSpells step now
    // demands exactly one cantrip pick alongside the two scribed spells.
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "wizard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true, name: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // Wizard gains an ASI at level 4; bump INT (not CON) so HP isn't perturbed.
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    const bookNames = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    for (const spell of spells) expect(bookNames).toContain(spell.name);
    expect(bookNames).toContain(cantrip.name);

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("advancement");
    expect(categories).toContain("spellcasting");
  });

  // The issue's undo AC names "HP, ability delta, hit die, spells" — the caster
  // ceremony covers the two domains the Battle Master undo test can't.
  it("single revert restores hp, ability delta, hit die, and unlearns the spells", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "wizard" } }, level: { gt: 0, lte: 2 }, edition: "EDITION_2024" }, orderBy: { level: "asc" }, take: 2, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "wizard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });
    expect(ceremony.status).toBe(200);
    expect(ceremony.body.abilityScores.intelligence).toBe(18);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(18);
    expect(res.body.hitPoints.current).toBe(18);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.abilityScores.intelligence).toBe(16);
    expect(res.body.spellcasting.spells).toHaveLength(0);
    expect(res.body.pendingLevelUps).toBe(1);
  });

  // #1440 — the exploit threat model: a crafted request bypassing the UI/picker
  // entirely. These are direct hand-crafted POSTs, not client-filtered picks.
  it("crafted request: a Wizard 3→4 cannot scribe off-class Cure Wounds (400, nothing in the spellbook)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // #1713 forked Cure Wounds (2014/2024 both exist now) — this fixture's
    // Wizard character defaults to EDITION_2024, so pin the fetch to that
    // fork rather than an unfiltered name lookup that could return either.
    const cureWounds = await prisma.spell.findFirstOrThrow({ where: { name: "Cure Wounds", edition: "EDITION_2024" }, select: { id: true } });
    const [wizardSpell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "wizard" } }, level: { gt: 0, lte: 2 }, edition: "EDITION_2024", name: { not: "Cure Wounds" } }, orderBy: { level: "asc" }, take: 1, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "wizard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: cureWounds.id }, { type: "learnSpell", spellId: wizardSpell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(400);
    // Exact text, not just the substring — capitalized to match the frontend's
    // spellListsLabel construction for the same served list (#1440 review).
    expect(res.body.error).toBe("Cure Wounds is not on the Wizard spell list.");
    expect(await eventCount(CHAR_ID)).toBe(0);
    const after = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect((after.spellcasting as { spells: unknown[] }).spells).toHaveLength(0);
  });

  it("crafted request: a Wizard 3→4 cannot scribe Fireball, above the level-2 ceiling (400)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // #1714 forked Fireball to EDITION_2014 (Sorcerer+Wizard, 2-list) — this
    // fixture's character is 2024 rules, so the pick must pin edition or it
    // can land on the 2014 sibling and 400 on the wrong-edition guard instead
    // of the level-ceiling check this test actually exercises.
    const fireball = await prisma.spell.findFirstOrThrow({ where: { name: "Fireball", edition: "EDITION_2024" }, select: { id: true } });
    const [wizardSpell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "wizard" } }, level: { gt: 0, lte: 2 }, edition: "EDITION_2024" }, orderBy: { level: "asc" }, take: 1, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "wizard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: fireball.id }, { type: "learnSpell", spellId: wizardSpell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/highest spell level/i);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

});

// #1440: the server-side gate is the only thing standing between a crafted
// request and an off-list / above-ceiling spell. These fixtures reach Bard
// Magical Secrets (level 10) — the one case where the class-list gate must
// widen rather than just enforce, and where the 2014/2024 fork must reach the
// gate (not just the plan builder).
describe("POST …/level-up/transactions — Bard Magical Secrets eligibility gate (#1440)", () => {
  async function makeBard(id: string, opts: { hitDiceTotal: number; xp: number; edition?: "EDITION_2014" | "EDITION_2024" }): Promise<string> {
    const bard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Bard" } });
    const collegeOfLore = (await prisma.subclass.findFirstOrThrow({ where: { classId: bard.id, name: "College of Lore" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id,
        name: "LevelUpTx Bard",
        ...(opts.edition ? { rulesEdition: opts.edition } : {}),
        experiencePoints: opts.xp,
        hitPoints: { current: 50, max: 50, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: opts.hitDiceTotal, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        // #1588: proficient in 2 skills — Bard's Expertise grants a step at
        // L9 (2024) and L3/L10 (2014); a level-up crossing either tier needs
        // a legal pick available (applyLearnExpertiseOp rejects a skill the
        // character isn't proficient in).
        skills: [
          { name: "performance", ability: "charisma", proficient: true },
          { name: "persuasion", ability: "charisma", proficient: true },
        ],
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{ name: "bard", subclass: "College of Lore", subclassId: collegeOfLore, classId: bard.id, position: 0, level: opts.hitDiceTotal }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } });
    return entry.id;
  }

  // #1588: Bard Expertise picks for a level-up crossing L9 (2024) or L10
  // (2014) — both fixture skills are legal (proficient), so this is the
  // fixed submission every affected test below reuses.
  const EXPERTISE_PICKS = [
    { type: "learnExpertise" as const, skill: "performance" },
    { type: "learnExpertise" as const, skill: "persuasion" },
  ];

  it("a Bard reaching 10 may take Fireball via Magical Secrets (200)", async () => {
    const CHAR_ID = "lvtx-bard-10";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000 });
    // #1714 forked Fireball to EDITION_2014 (Sorcerer+Wizard, 2-list) — this
    // fixture's character is 2024 rules, so pin edition or the pick can land
    // on the 2014 sibling and 400 on the wrong-edition guard instead of
    // exercising Magical Secrets eligibility.
    const fireball = await prisma.spell.findFirstOrThrow({ where: { name: "Fireball", edition: "EDITION_2024" }, select: { id: true } });
    // #1713 forked several Bard-list cantrips for real (Mage Hand, ...) — this
    // fixture defaults to EDITION_2024 (no `edition` opt passed), so pin it.
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "bard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: fireball.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain("Fireball");
  });

  it("a Bard reaching 10 may NOT take ranger-only Ensnaring Strike (400)", async () => {
    const CHAR_ID = "lvtx-bard-10-ensnaring";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000 });
    // #1721 authored a real 2014 "Ensnaring Strike" row (previously only the
    // 2024 catalog had one) — pin edition so this 2024 Bard's pick can't
    // land on the 2014 sibling (which would 400 on the wrong-edition guard
    // instead of exercising the 4-list Magical Secrets rejection below).
    const ensnaringStrike = await prisma.spell.findFirstOrThrow({ where: { name: "Ensnaring Strike", edition: "EDITION_2024" }, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "bard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: ensnaringStrike.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });
    expect(res.status).toBe(400);
    // Exact text: the 4-list 2024 Magical Secrets rejection must name every
    // served list — capitalized, Oxford-comma "or"-joined — matching the level-up
    // banner's spellListsLabel (frontend) for this same served list (#1440 review).
    expect(res.body.error).toBe("Ensnaring Strike is not on the Bard, Cleric, Druid, or Wizard spell lists.");
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("a Bard reaching 9 (no Magical Secrets yet) may NOT take Fireball (400)", async () => {
    const CHAR_ID = "lvtx-bard-9";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 8, xp: 48000 });
    // #1714 forked Fireball to EDITION_2014 — pin edition so this 2024 Bard's
    // pick can't land on the 2014 sibling (which would 400 on the
    // wrong-edition guard instead of "not on the Bard spell list").
    const fireball = await prisma.spell.findFirstOrThrow({ where: { name: "Fireball", edition: "EDITION_2024" }, select: { id: true } });
    const [bardSpell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: { gt: 0 }, edition: "EDITION_2024", name: { not: "Fireball" } }, orderBy: { level: "asc" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      // #1588: this level-up also crosses Bard Expertise's L9 tier (2024) —
      // include the now-required pick so the ONLY 400 in play is the
      // Magical Secrets rejection under test.
      expertise: EXPERTISE_PICKS,
      spellsLearned: [{ type: "learnSpell", spellId: fireball.id }, { type: "learnSpell", spellId: bardSpell.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Fireball is not on the Bard spell list.");
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("a 2014 Bard reaching 10 may take ranger-only Ensnaring Strike (unrestricted, PHB'14)", async () => {
    const CHAR_ID = "lvtx-bard-10-2014";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000, edition: "EDITION_2014" });
    // #1721 authored this row for real (previously only the 2024 catalog had
    // one) — pin edition so this 2014 Bard's pick can't land on the 2024
    // sibling (wrong-edition guard) instead of exercising the PHB'14
    // unrestricted-Magical-Secrets path this test is named for.
    const ensnaringStrike = await prisma.spell.findFirstOrThrow({ where: { name: "Ensnaring Strike", edition: "EDITION_2014" }, select: { id: true } });
    // #1509: SRD 5.1's Bard 9→10 Spells Known delta is 12→14 = 2 (not 2024's
    // 9→10 = 1) — a second pick is now REQUIRED for this level-up to validate,
    // proof the edition-correct count reaches this Magical Secrets gate too.
    // #1713 review: `level: { gt: 0 }` alone is not enough now that the 2014
    // shared/3+-list bucket gave Bard real level 6-9 spells (Etherealness,
    // ...) — an un-ordered `take: 1` could land on one of those and blow the
    // level-9 caster's highest-learnable-level ceiling (5), 400ing on
    // "exceeds the highest spell level you can learn" instead of exercising
    // Magical Secrets. `lte: 5` + `orderBy` keeps the pick both legal and
    // deterministic.
    const [second] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: { gt: 0, lte: 5 }, edition: "EDITION_2014", name: { not: "Ensnaring Strike" } }, orderBy: { level: "asc" }, take: 1, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "bard" } }, level: 0, edition: "EDITION_2014" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      // #1588: this level-up also crosses Bard Expertise's 2014 L10 tier
      // (2 more, PHB'14 p.53) — a required step this level-up must satisfy.
      expertise: EXPERTISE_PICKS,
      spellsLearned: [{ type: "learnSpell", spellId: ensnaringStrike.id }, { type: "learnSpell", spellId: second.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain("Ensnaring Strike");
  });

  it("a 2024 Bard reaching 10 may NOT take a wizard-only cantrip — 2024 Magical Secrets never broadens cantrips (400)", async () => {
    const CHAR_ID = "lvtx-bard-10-cantrip-2024";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000 });
    // #1714 forked Fire Bolt to EDITION_2014 (Sorcerer+Wizard, 2-list) — pin
    // edition so this 2024 Bard's pick can't land on the 2014 sibling
    // (wrong-edition guard) instead of exercising the cantrip-list rejection.
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2024" }, select: { id: true } });
    const [bardSpell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: { gt: 0 }, edition: "EDITION_2024" }, orderBy: { level: "asc" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: bardSpell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: fireBolt.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantrip list/i);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("a 2014 Bard reaching 10 MAY take a wizard-only cantrip (PHB'14 \"…or a cantrip\")", async () => {
    const CHAR_ID = "lvtx-bard-10-cantrip-2014";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000, edition: "EDITION_2014" });
    // #1714 forked Fire Bolt to EDITION_2014 too — this fixture's character
    // IS 2014 rules, so pin edition for determinism (an unordered
    // findFirstOrThrow across two same-named rows isn't guaranteed to return
    // either one consistently, even though this test happened to pass before
    // this pin was added).
    const fireBolt = await prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition: "EDITION_2014" }, select: { id: true } });
    // Same determinism pin as fireBolt above (Ensnaring Strike also forked
    // 2014/2024, #1714) — an unordered findFirstOrThrow across same-named
    // rows is never guaranteed to return either one consistently, and #1796's
    // migration rewrote every Spell row (backfilling catalogEntryId), which
    // is exactly the kind of physical-order shift this class of bug depends on.
    const ensnaringStrike = await prisma.spell.findFirstOrThrow({
      where: { name: "Ensnaring Strike", edition: "EDITION_2014" },
      select: { id: true },
    });
    // #1509: SRD 5.1's Bard 9→10 Spells Known delta is 2, not 2024's 1 — see the sibling test above.
    // `lte: 5` + `orderBy`: same reasoning as the sibling test above — a bare
    // `level: { gt: 0 }` can land on one of the 2014 shared bucket's level
    // 6-9 Bard spells and blow this level-9 caster's learnable-level ceiling.
    const [second] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: { gt: 0, lte: 5 }, edition: "EDITION_2014", name: { not: "Ensnaring Strike" } }, orderBy: { level: "asc" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      // #1588: same required L10 (2014) Expertise tier as the sibling test above.
      expertise: EXPERTISE_PICKS,
      spellsLearned: [{ type: "learnSpell", spellId: ensnaringStrike.id }, { type: "learnSpell", spellId: second.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: fireBolt.id }],
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain("Ensnaring Strike");
    expect(names).toContain("Fire Bolt");
  });

  it("an unknown spellId still falls through to the catalog not-found error, not the eligibility gate", async () => {
    const CHAR_ID = "lvtx-bard-10-unknown";
    const entryId = await makeBard(CHAR_ID, { hitDiceTotal: 9, xp: 64000 });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "bard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: "bogus-but-well-formed-spell-id" }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell not found in catalog/i);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// #1509: the 2014 known-caster fork reaches the level-up TRANSACTION endpoint —
// edition-correct pick counts enforced server-side (not just previewed by the
// plan), the Ranger's onLevelUp swap, and the known-vs-prepared noun in the
// three swap-rejection messages (#1509 D5).
describe("POST …/level-up/transactions — 2014 known-caster level-up (#1509)", () => {
  async function make1509Bard(
    id: string,
    opts: { hitDiceTotal: number; xp: number; edition: "EDITION_2014" | "EDITION_2024"; known?: { id: string; name: string }[] },
  ): Promise<string> {
    const bard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Bard" } });
    const collegeOfLore = (await prisma.subclass.findFirstOrThrow({ where: { classId: bard.id, name: "College of Lore" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id,
        name: "LevelUpTx Bard 1509",
        rulesEdition: opts.edition,
        experiencePoints: opts.xp,
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: opts.hitDiceTotal, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: {
          slotsUsed: {}, arcanumUsed: {}, concentratingOn: null,
          spells: (opts.known ?? []).map((s, i) => ({
            id: `bard-1509-known-${i}`, spellId: s.id, name: s.name, level: 1, school: "enchantment",
            prepared: true, castingTime: "1 action", range: "30 ft", duration: "Instantaneous", description: "x",
          })),
        },
        classEntries: {
          create: [{ name: "bard", subclass: "College of Lore", subclassId: collegeOfLore, classId: bard.id, position: 0, level: opts.hitDiceTotal }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } });
    return entry.id;
  }

  it("a 2014 Bard 4→5 submitting 2 spellsLearned with no forget is rejected 400 (the plan grants 1)", async () => {
    const CHAR_ID = "lvtx-1509-bard-2014-reject";
    const entryId = await make1509Bard(CHAR_ID, { hitDiceTotal: 4, xp: 6500, edition: "EDITION_2014" });
    // #1713 forked several Bard-list spells for real (Cure Wounds, Charm
    // Person, ...) — `edition` keeps this on the requesting character's own
    // catalog rows, same as the app itself resolves.
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition: "EDITION_2014" }, take: 2, select: { id: true } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 1 new spells for this level-up, got 2/i);
  });

  it("a 2014 Bard 4→5 submitting 1 spellsLearned succeeds", async () => {
    const CHAR_ID = "lvtx-1509-bard-2014-ok";
    const entryId = await make1509Bard(CHAR_ID, { hitDiceTotal: 4, xp: 6500, edition: "EDITION_2014" });
    const [spell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition: "EDITION_2014" }, take: 1, select: { id: true, name: true } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.spells.map((s: { name: string }) => s.name)).toContain(spell.name);
  });

  it("a 2014 Bard 4→5 submitting 2 spellsLearned with 1 spellsForgotten succeeds (the #1101 swap)", async () => {
    const known = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition: "EDITION_2014" }, select: { id: true, name: true } });
    const CHAR_ID = "lvtx-1509-bard-2014-swap";
    const entryId = await make1509Bard(CHAR_ID, { hitDiceTotal: 4, xp: 6500, edition: "EDITION_2014", known: [known] });
    const fresh = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition: "EDITION_2014", id: { not: known.id } }, take: 2, select: { id: true, name: true } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "bard-1509-known-0" }],
      spellsLearned: fresh.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).not.toContain(known.name);
    for (const s of fresh) expect(names).toContain(s.name);
  });

  it("the same 2-learn submission succeeds for a 2024 Bard — the proof the fork is the count, not the validator", async () => {
    const CHAR_ID = "lvtx-1509-bard-2024-ok";
    const entryId = await make1509Bard(CHAR_ID, { hitDiceTotal: 4, xp: 6500, edition: "EDITION_2024" });
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition: "EDITION_2024" }, take: 2, select: { id: true } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(200);
  });

  it("swap-rejection messages say 'known spell' for a 2014 Bard and 'prepared spell' for a 2024 Bard", async () => {
    // Bard 4→5 grants count 1 under EDITION_2014, 2 under EDITION_2024 (#1509) —
    // net learns must equal `count` for assertCounts to pass and reach the
    // forget-specific checks these cases actually target.
    const cases = [
      { edition: "EDITION_2014" as const, id: "lvtx-1509-bard-noun-2014", noun: "known spell", count: 1 },
      { edition: "EDITION_2024" as const, id: "lvtx-1509-bard-noun-2024", noun: "prepared spell", count: 2 },
    ];
    for (const { edition, id, noun, count } of cases) {
      const entryId = await make1509Bard(id, { hitDiceTotal: 4, xp: 6500, edition });
      const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "bard" } }, level: 1, edition }, take: count + 2, select: { id: true } });

      const tooMany = await post(id, {
        target: { kind: "existing", classEntryId: entryId },
        hp: { method: "average" },
        spellsForgotten: [{ type: "forgetSpell", entryId: "x" }, { type: "forgetSpell", entryId: "y" }],
        spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      });
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.error).toBe(`You may swap at most one ${noun} per level-up.`);

      const notSwappable = await post(id, {
        target: { kind: "existing", classEntryId: entryId },
        hp: { method: "average" },
        spellsForgotten: [{ type: "forgetSpell", entryId: "bogus-entry" }],
        spellsLearned: spells.slice(0, count + 1).map((s) => ({ type: "learnSpell", spellId: s.id })),
      });
      expect(notSwappable.status).toBe(400);
      expect(notSwappable.body.error).toBe(`Cannot swap that spell: bogus-entry is not a swappable ${noun}.`);
    }
  });

  it("a 2014 Ranger 1→2 offers the onLevelUp swap; a 2024 Ranger 1→2 is flatly rejected (does not allow swapping)", async () => {
    async function makeRanger(id: string, edition: "EDITION_2014" | "EDITION_2024"): Promise<string> {
      const ranger = await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" } });
      await prisma.character.create({
        data: {
          ...BASE,
          ownerId: OWNER_ID,
          id,
          name: "LevelUpTx Ranger 1509",
          rulesEdition: edition,
          experiencePoints: 300, // level 2 threshold
          hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
          hitDice: { total: 1, die: "d10", spent: 0 },
          abilityScores: { strength: 12, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 8 },
          // #1588: proficient in survival — 2024 Ranger's Deft Explorer grants
          // an Expertise step at L2 (EDITION_2024 only), so a legal pick must
          // be available for that branch's level-up to validate.
          skills: [{ name: "survival", ability: "wisdom", proficient: true }],
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          classEntries: { create: [{ name: "ranger", subclass: null, classId: ranger.id, position: 0, level: 1 }] },
        },
      });
      const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } });
      return entry.id;
    }

    // Ranger 1→2 also grants its Fighting Style feat pick (#1137) — every request
    // below includes it so the ONLY 400 in play is the swap-related one under test.
    // #1726 seeded a 2014-edition "Defense" row alongside the pre-existing 2024
    // one — a bare `{ name: "Defense" }` lookup is ambiguous the moment both
    // exist, and each Ranger character below must take the feat matching its
    // OWN edition or crossEditionRejection (lib/leveling/advancement.ts) 400s
    // the take-feat op before the swap logic under test is even reached.
    const defense2024 = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style", edition: "EDITION_2024" } });
    const defense2014 = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style", edition: "EDITION_2014" } });

    const entry2024 = await makeRanger("lvtx-1509-ranger-2024", "EDITION_2024");
    const res2024 = await post("lvtx-1509-ranger-2024", {
      target: { kind: "existing", classEntryId: entry2024 },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense2024.id },
      // #1588: 2024 Ranger 1→2 also grants a required Deft Explorer Expertise
      // pick — included so the ONLY 400 in play is the swap rejection under test.
      expertise: [{ type: "learnExpertise", skill: "survival" }],
      spellsForgotten: [{ type: "forgetSpell", entryId: "whatever" }],
    });
    expect(res2024.status).toBe(400);
    expect(res2024.body.error).toMatch(/does not allow swapping/i);

    // A 2014 Ranger 1→2 is the class's FIRST spellcasting level (SRD 5.1 gates
    // Spellcasting to level 2), so there is no prior known spell to name — but
    // canSwap IS true (onLevelUp cadence), so the rejection comes from the
    // specific-entry check, not the cadence gate. That is a materially
    // different message from the 2024 case above, and proves the fork.
    const entry2014 = await makeRanger("lvtx-1509-ranger-2014", "EDITION_2014");
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "ranger" } }, level: 1, edition: "EDITION_2014" }, take: 3, select: { id: true } });
    expect(spells.length).toBe(3);
    const res2014 = await post("lvtx-1509-ranger-2014", {
      target: { kind: "existing", classEntryId: entry2014 },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense2014.id },
      spellsForgotten: [{ type: "forgetSpell", entryId: "whatever" }],
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res2014.status).toBe(400);
    expect(res2014.body.error).not.toMatch(/does not allow swapping/i);
    expect(res2014.body.error).toBe("Cannot swap that spell: whatever is not a swappable known spell.");
  });

  // #1440 regression pin, now edition-correct (#1507 D4): a 2014 Ranger has no
  // Spellcasting feature until level 2, so a fresh level-1 add (multiclass) has
  // NO newSpells step at all — a spellsLearned submission is flatly excess.
  it("a 2014 Ranger added at level 1 (multiclass) cannot submit a level-1 spellsLearned pick", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const champion = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Champion" } })).id;
    const CHAR_ID = "lvtx-1509-ranger-mc-2014";
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Ranger MC 1509",
        rulesEdition: "EDITION_2014",
        experiencePoints: 14000, // level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d10", spent: 0 },
        abilityScores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", subclassId: champion, classId: fighter.id, position: 0, level: 5 }] },
      },
    });
    const ranger = await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" } });
    const [spell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "ranger" } }, level: 1, edition: "EDITION_2014" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: ranger.id },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not grant new spells/i);
  });
});

// Prepared-spell swap (#1101/#1127): a Sorcerer (onLevelUp cadence) may forget one
// prepared spell and learn an extra one in the same level-up. Forget applies BEFORE
// learn. Sorcerer 5→6 is a clean count-1 level (prepared 9 → 10; no ASI/subclass step).
describe("POST …/level-up/transactions — prepared-spell swap (Sorcerer 5→6, #1101)", () => {
  const CHAR_ID = "lvtx-sorcerer-swap";
  let seeded: Array<{ id: string; name: string }>; // catalog spells seeded as known
  let fresh: Array<{ id: string; name: string }>;   // catalog spells to learn new

  // Minimal known-spell entry snapshot; only id/spellId/level/source matter for
  // the swap, but the serializer reads the descriptive fields too.
  function entryFor(spell: { id: string; name: string; level: number; school: string; castingTime: string; range: string; duration: string; description: string }, entryId: string) {
    return {
      id: entryId,
      spellId: spell.id,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      prepared: false,
      castingTime: spell.castingTime,
      range: spell.range,
      duration: spell.duration,
      description: spell.description,
    };
  }

  beforeEach(async () => {
    const sorcerer = await prisma.characterClass.findFirstOrThrow({ where: { name: "Sorcerer" } });
    const draconicBloodline = (await prisma.subclass.findFirstOrThrow({ where: { classId: sorcerer.id, name: "Draconic Bloodline" } })).id;
    // #1713 forked several Sorcerer-list level-1 spells for real (Charm
    // Person, Thunderwave, ...) — this fixture defaults to EDITION_2024, so
    // pin the pool to that fork rather than an edition-unaware query.
    const pool = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "sorcerer" } }, level: 1, edition: "EDITION_2024" }, take: 5 });
    expect(pool.length).toBe(5);
    seeded = [pool[0], pool[1]];
    fresh = [pool[2], pool[3], pool[4]];
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Sorcerer Swap",
        experiencePoints: 14000, // level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: {
          slotsUsed: {}, arcanumUsed: {}, concentratingOn: null,
          spells: [entryFor(pool[0], "known-a"), entryFor(pool[1], "known-b")],
        },
        classEntries: { create: [{ name: "sorcerer", subclass: "Draconic Bloodline", subclassId: draconicBloodline, classId: sorcerer.id, position: 0, level: 5 }] },
      },
    });
  });

  it("forgets one known spell and learns two new ones under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: fresh.slice(0, 2).map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).not.toContain(seeded[0].name); // forgotten
    expect(names).toContain(seeded[1].name);     // kept
    for (const s of fresh.slice(0, 2)) expect(names).toContain(s.name); // learned
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("swap-to-same-spellId works ONLY because forget applies before learn", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Re-learn the very spellId being forgotten (known-a → seeded[0].id), plus one
    // genuinely new spell. A learn-first order would 409 on the duplicate spellId.
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: [
        { type: "learnSpell", spellId: seeded[0].id },
        { type: "learnSpell", spellId: fresh[0].id },
      ],
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(seeded[0].name);
    expect(names).toContain(fresh[0].name);
  });

  it("a single revert restores the forgotten spell and removes the learned ones", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: fresh.slice(0, 2).map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(ceremony.status).toBe(200);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(seeded[0].name); // restored
    for (const s of fresh.slice(0, 2)) expect(names).not.toContain(s.name); // learns undone
    expect(res.body.pendingLevelUps).toBe(1);
  });

  it("400: two forgets are rejected", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // Net stays at the step count (1): 2 forgets offset by 3 learns, so
      // assertCounts passes and the ≤1-forget guard is what rejects.
      spellsForgotten: [
        { type: "forgetSpell", entryId: "known-a" },
        { type: "forgetSpell", entryId: "known-b" },
      ],
      spellsLearned: fresh.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most one/i);
  });

  it("400: malformed forget op (missing entryId) → Invalid request body", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell" }],
      spellsLearned: fresh.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });
});

// A Fighter has no newSpells step, so any forget is rejected up front (#1101).
describe("POST …/level-up/transactions — swap rejected for a non-caster (#1101)", () => {
  it("400: a Fighter 7→8 forget is rejected (does not allow swapping)", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const champion = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Champion" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-fighter-swap",
        name: "LevelUpTx Fighter Swap",
        experiencePoints: 34000,
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", subclassId: champion, classId: fighter.id, position: 0, level: 7 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-fighter-swap" } });
    const res = await post("lvtx-fighter-swap", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      spellsForgotten: [{ type: "forgetSpell", entryId: "whatever" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not allow swapping/i);
  });
});

// HP applies first in-tx, so a failure in the last (spell) op proves the whole
// ceremony rolls back — the core #885 acceptance criterion.
describe("POST …/level-up/transactions — atomicity (mid-apply failure rolls back everything)", () => {
  const CHAR_ID = "lvtx-atomicity-wizard";

  beforeEach(async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Atomicity Wizard",
        experiencePoints: 2700, // level 4 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });
  });

  it("rolls back hp + ASI + the first (valid) spell when the LAST spell id is bogus", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const [realSpell] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "wizard" } }, level: { gt: 0, lte: 2 }, edition: "EDITION_2024" }, orderBy: { level: "asc" }, take: 1, select: { id: true, name: true } });
    expect(realSpell).toBeDefined();
    // #1131: wizard L4 also demands one cantrip; a valid one keeps the failure in
    // the LAST leveled spell so the atomicity assertion still exercises the rollback.
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "wizard" } }, level: 0, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      // Count is 2 (passes zod + validator); the FIRST is real, the LAST is a
      // well-formed but nonexistent id that fails inside the spellcasting seam
      // AFTER hp/ASI/first-spell have already written — the whole tx must roll back.
      spellsLearned: [
        { type: "learnSpell", spellId: realSpell.id },
        { type: "learnSpell", spellId: "bogus-but-well-formed-spell-id" },
      ],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell not found in catalog/i);

    // Nothing persisted: re-read the raw row and assert every touched domain is
    // exactly as seeded, and NO events were written.
    const after = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect(after.hitPoints).toMatchObject({ max: 18, current: 18 });
    expect(after.hitDice).toMatchObject({ total: 3 });
    expect(after.abilityScores).toMatchObject({ intelligence: 16 });
    const book = (after.spellcasting as { spells: Array<{ id: string }> }).spells;
    expect(book).toHaveLength(0); // the valid first spell must NOT be present
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// The ceremony shares one batchId, so a single revertBatch must reverse every
// domain it touched — the other core #885 acceptance criterion.
describe("POST …/level-up/transactions — whole-ceremony single undo (revertBatch)", () => {
  const CHAR_ID = "lvtx-undo-battlemaster";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Undo Battle Master",
        experiencePoints: 900, // level 3 threshold; hitDice.total 2 → 1 pending
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 2 }],
        },
      },
    });
  });

  it("reverts hp + subclass + maneuvers + tool proficiency, restoring the pending level-up", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });
    expect(maneuvers).toHaveLength(3);

    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });
    expect(ceremony.status).toBe(200);
    expect(ceremony.body.hitDice.total).toBe(3);
    expect(ceremony.body.pendingLevelUps).toBe(0);

    // The whole ceremony is one batch — a single revert undoes all of it.
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
    const batchId = await latestBatchId(CHAR_ID);
    const res = await revert(CHAR_ID, batchId);
    expect(res.status).toBe(200);

    // Full reversal across every domain the ceremony touched.
    expect(res.body.hitDice.total).toBe(2); // hit die reverted
    expect(res.body.hitPoints.max).toBe(18);
    expect(res.body.hitPoints.current).toBe(18);
    expect(res.body.classes[0].subclass ?? null).toBeNull(); // subclass back to null
    expect(res.body.resources.maneuversKnown).toHaveLength(0); // maneuvers gone
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).not.toContain("Smith's Tools");
    // XP was untouched but hitDice reverted, so the level-up is pending again.
    expect(res.body.pendingLevelUps).toBe(1);

    // The persisted primary entry's subclass is cleared too (not just the response).
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted.subclass ?? null).toBeNull();
  });
});

describe("POST …/level-up/transactions — rejection matrix", () => {
  const fighterClass = () => prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });

  // Fighter fixture with explicit XP / hit-dice / entry level / subclass.
  async function makeFighter(opts: {
    id: string;
    name: string;
    xp: number;
    hitDiceTotal: number;
    entryLevel: number;
    subclass: string | null;
  }): Promise<string> {
    const fighter = await fighterClass();
    const subclassId = opts.subclass
      ? (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: opts.subclass } })).id
      : null;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: opts.id,
        name: opts.name,
        experiencePoints: opts.xp,
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: opts.hitDiceTotal, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: opts.subclass, subclassId, classId: fighter.id, position: 0, level: opts.entryLevel }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: opts.id } });
    return entry.id;
  }


  it("zod 400: missing hp entirely → Invalid request body", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-nohp", name: "LevelUpTx Rej NoHp", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-nohp", {
      target: { kind: "existing", classEntryId: entryId },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });

  it("zod 400: malformed advancement op (bad type) → Invalid request body", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-badadv", name: "LevelUpTx Rej BadAdv", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-badadv", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeNothing", increases: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });


  it("validator 400: excess spellsLearned for a Fighter → does not grant new spells", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-excessspell", name: "LevelUpTx Rej ExcessSpell", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-excessspell", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: "any-spell-id" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not grant new spells/i);
  });

  it("validator 400: wrong maneuver count for a Battle Master ceremony → expected 3", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-maneuvers", name: "LevelUpTx Rej Maneuvers", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 2, select: { id: true } });
    const res = await post("lvtx-rej-maneuvers", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })), // only 2
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 3/i);
  });

  it("validator 400: subclassId when the target already has a subclass → does not include a subclass choice", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-hassub", name: "LevelUpTx Rej HasSub", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const res = await post("lvtx-rej-hassub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      subclassId: battleMaster.id, // real id → resolves, but the level grants no subclass choice
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not include a subclass choice/i);
  });

  it("validator 400: missing subclassId on a Fighter 2→3 → requires choosing a subclass", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-nosub", name: "LevelUpTx Rej NoSub", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const res = await post("lvtx-rej-nosub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires choosing a subclass/i);
  });

  it("validator 400: unknown (well-formed but nonexistent) subclassId → Subclass not found", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-unknownsub", name: "LevelUpTx Rej UnknownSub", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const res = await post("lvtx-rej-unknownsub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      subclassId: "nonexistent-subclass-id",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subclass not found/i);
  });


  it("in-tx 400: valid-shaped submission but no pending level-up → the hp seam throws", async () => {
    // XP 2700 derives level 4; hitDice.total already 4 → newLevel 5 validates
    // (level-5 Fighter grants only hit points), but the hp seam sees no pending
    // level and throws inside the tx.
    const entryId = await makeFighter({ id: "lvtx-rej-nopending", name: "LevelUpTx Rej NoPending", xp: 2700, hitDiceTotal: 4, entryLevel: 4, subclass: "Champion" });
    const res = await post("lvtx-rej-nopending", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no pending level-up/i);
  });


  it("a subclass choice on a NON-primary multiclass entry commits — subclass + maneuvers + tool land on the secondary entry (#1177)", async () => {
    const CHAR_ID = "lvtx-rej-multiclass";
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await fighterClass();
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Rej Multiclass",
        experiencePoints: 6500, // total level 5; multiclass path uses entry.level+1 (2→3, entries sum 4→5)
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 4, die: "d8", spent: 0 }, // < derived → a pending level exists
        abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 2 },
            { name: "fighter", subclass: null, classId: fighter.id, position: 1, level: 2 },
          ],
        },
      },
    });
    // Target the SECOND (non-primary) entry at its subclass level (fighter 2→3).
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "fighter", level: 3, subclass: "Battle Master" });
    expect(res.body.resources.maneuverChoiceCount).toBe(3); // fighter-3 Battle Master cap
    expect(res.body.resources.maneuversKnown).toHaveLength(3);
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).toContain("Smith's Tools");

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.subclass).toBe("Battle Master");
  });

  // Status-only asserts, matching the authorization.test.ts access-guard convention.

  it("404: nonexistent characterId", async () => {
    const res = await post("lvtx-does-not-exist", {
      target: { kind: "existing", classEntryId: "whatever" },
      hp: { method: "average" },
    });
    expect(res.status).toBe(404);
  });

  it("403: a character owned by someone else", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-foreign", name: "LevelUpTx Rej Foreign", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await supertest(app)
      .post(`/api/characters/lvtx-rej-foreign/level-up/transactions`)
      .set("Cookie", COOKIE_2) // a different owner
      .send({
        target: { kind: "existing", classEntryId: entryId },
        hp: { method: "average" },
        advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      });
    expect(res.status).toBe(403);
  });
});

// Non-primary ceremonies (#1065): multiclass-into-Fighter is the canonical case —
// its plan is [hitPoints, fightingStyleFeat, review], so without generalized class
// appliers no valid submission exists at all.
describe("POST …/level-up/transactions — multiclass ceremonies (#1065)", () => {
  const WIZARD_FIXTURE = {
    ...BASE,
    ownerId: OWNER_ID,
    // STR 14 satisfies the Fighter multiclass prerequisite (STR 13 or DEX 13).
    abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
    spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
  };

  it("multiclass INTO Fighter applies hp + fighting-style feat under one batchId, and it survives serialization", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    // Pinned to EDITION_2024 (#1311): these fixtures never set rulesEdition, so
    // they default to EDITION_2024, and a bare name+category match became
    // ambiguous the moment a 2014 "Defense" row exists alongside it.
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style", edition: "EDITION_2024" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    const CHAR_ID = "lvtx-mc-into-fighter";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Into Fighter",
        experiencePoints: 2700, // level 4 threshold; hitDice.total 3 → 1 pending
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    // The new level-1 Fighter entry exists and the fs feat is VISIBLE on the wire
    // — the read-side clamp keeps it since the Fighter entry entitles a fs slot.
    expect(res.body.classes).toHaveLength(2);
    // The created entry snapshots the catalog's display name ("Fighter").
    expect(res.body.classes[1]).toMatchObject({ name: "Fighter", level: 1 });
    const fsAdv = res.body.advancements.find((a: { slot?: string }) => a.slot === "fightingStyle");
    expect(fsAdv?.featName).toBe("Defense");
    expect(res.body.fightingStyleSlots).toMatchObject({ total: 1, used: 1 });

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    // Persisted, not just serialized.
    const after = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect((after.resources as { advancements: { slot?: string }[] }).advancements.some((a) => a.slot === "fightingStyle")).toBe(true);
  });

  it("single revert undoes the whole multiclass ceremony: entry gone, fs feat cleared", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    // Pinned to EDITION_2024 (#1311): these fixtures never set rulesEdition, so
    // they default to EDITION_2024, and a bare name+category match became
    // ambiguous the moment a 2014 "Defense" row exists alongside it.
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style", edition: "EDITION_2024" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    const CHAR_ID = "lvtx-mc-undo";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Undo",
        experiencePoints: 2700,
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });

    const ceremony = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });
    expect(ceremony.status).toBe(200);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.advancements.some((a: { slot?: string }) => a.slot === "fightingStyle")).toBe(false);
    expect(res.body.pendingLevelUps).toBe(1);
  });

  it("an EXISTING non-primary Fighter 2→3 can choose a subclass with no resource choices (Champion)", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const champion = await prisma.subclass.findFirstOrThrow({ where: { name: "Champion", classId: fighter.id } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    const CHAR_ID = "lvtx-mc-champion";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Champion",
        experiencePoints: 14000, // level 6 threshold; entries sum 5 → 1 pending
        hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: null, classId: fighter.id, position: 1, level: 2 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: champion.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(6);
    expect(res.body.classes[1].subclass).toBe("Champion");

    // The subclass landed on the SECONDARY entry, not the primary.
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.subclass).toBe("Champion");
    const primary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 0 } });
    expect(primary.subclass).toBe("School of Evocation");
  });

  // An ALREADY-subclassed non-primary entry: Battle Master Fighter 6→7 grants
  // only maneuvers (no subclass step) — the entry-scoped cap must come from
  // the fighter entry's own level 7, not the wizard primary (#1177).
  it("a non-primary Battle Master 6→7 (maneuvers-only plan) commits and caps at the fighter-7 count; single revert restores everything", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    const battleMaster = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } })).id;
    const CHAR_ID = "lvtx-mc-bm-maneuvers";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC BM Maneuvers",
        experiencePoints: 64000, // level 10 threshold; entries sum 9 → 1 pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 9, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", subclassId: battleMaster, classId: fighter.id, position: 1, level: 6 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    // Fighter 6→7 grants a delta of 2 new maneuver picks (5 at L7 minus 3 at L6).
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 2, select: { id: true } });
    expect(maneuvers).toHaveLength(2);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "fighter", level: 7 });
    expect(res.body.resources.maneuverChoiceCount).toBe(5); // fighter-7 Battle Master cap
    expect(res.body.resources.maneuversKnown).toHaveLength(2); // the ceremony's own delta

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    const undo = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(undo.status).toBe(200);
    expect(undo.body.classes[1].level).toBe(6);
    expect(undo.body.resources.maneuversKnown).toHaveLength(0);
    expect(undo.body.pendingLevelUps).toBe(1);
  });

  it("a monk-secondary Warrior of the Elements ceremony (monk 2→3) grants the subclass with no choice step", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
    const warriorOfElements = await prisma.subclass.findFirstOrThrow({ where: { name: "Warrior of the Elements" } });
    const champion = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Champion" } })).id;
    const CHAR_ID = "lvtx-mc-monk-elements";
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx MC Monk Elements",
        experiencePoints: 34000, // level 8 threshold; entries sum 7 (fighter 5 + monk 2) → 1 pending
        hitPoints: { current: 50, max: 50, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d8", spent: 0 },
        abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 15, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "fighter", subclass: "Champion", subclassId: champion, classId: fighter.id, position: 0, level: 5 },
            { name: "monk", subclass: null, classId: monk.id, position: 1, level: 2 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });

    const plan = await supertest(app)
      .get(`/api/characters/${CHAR_ID}/level-up/plan`)
      .query({ classEntryId: secondary.id, subclassId: warriorOfElements.id })
      .set("Cookie", COOKIE);
    expect(plan.status).toBe(200);
    // Warrior of the Elements has only fixed features — no choose-N step.
    const kinds = (plan.body.steps as Array<{ kind: string }>).map((s) => s.kind);
    expect(kinds).not.toContain("disciplines");

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: warriorOfElements.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "monk", level: 3, subclass: "Warrior of the Elements" });
  });

  it("atomicity: a bogus maneuverId 400s the whole ceremony — entry level unchanged, zero events", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    const battleMaster = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } })).id;
    const CHAR_ID = "lvtx-mc-bm-atomicity";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC BM Atomicity",
        experiencePoints: 64000, // level 10 threshold; entries sum 9 → 1 pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 9, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", subclassId: battleMaster, classId: fighter.id, position: 1, level: 6 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    const [real] = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      maneuvers: [
        { type: "learnManeuver", maneuverId: real.id },
        { type: "learnManeuver", maneuverId: "not-a-real-maneuver-id" },
      ],
    });
    expect(res.status).toBe(400);

    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.level).toBe(6);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// Hunter's Prey (Ranger → Hunter, L3) is the seeded generic subclass choice that
// makes the known-key count check reachable without fixture gymnastics.
describe("POST …/level-up/transactions — subclassChoice validator messages", () => {
  it("rejects a subclassChoices entry with a bogus choiceKey on a ceremony with no such step", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const champion = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Champion" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-choice-bogus",
        name: "LevelUpTx Choice Bogus",
        experiencePoints: 34000, // Fighter 7→8: hp + ASI only, no subclassChoice step
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", subclassId: champion, classId: fighter.id, position: 0, level: 7 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-choice-bogus" } });

    const res = await post("lvtx-choice-bogus", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "bogusKey", optionId: "x" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not include a "bogusKey" choice/i);
  });

  it("enforces the count of a KNOWN generic subclass choice (Ranger→Hunter, Hunter's Prey at L3)", async () => {
    const ranger = await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" } });
    const hunter = await prisma.subclass.findFirstOrThrow({ where: { name: "Hunter", classId: ranger.id } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-choice-hunter",
        name: "LevelUpTx Choice Hunter",
        experiencePoints: 900, // level 3 threshold; hitDice.total 2 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 12, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 8 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "ranger", subclass: null, classId: ranger.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-choice-hunter" } });

    // Hunter's Prey grants exactly ONE choice at L3; submit TWO → count mismatch.
    // (2024: the Ranger re-prepares on a rest, so there is no newSpells step here.)
    const res = await post("lvtx-choice-hunter", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: hunter.id,
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "a" },
        { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "b" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 1 huntersPrey choices for this level-up, got 2/i);
  });
});

// #1503: Way of the Four Elements riding the level-up ceremony end-to-end —
// the ceremony's own STEP_OP_BUILDERS/domain-dispatch wiring, not just the
// pure validator (already covered unit-level in level-up-submission.test.ts).
describe("POST …/level-up/transactions — Way of the Four Elements disciplines (#1503)", () => {
  it("2→3: picking the subclass + learning the free discipline pick lands both under one batch", async () => {
    const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
    const fourElements = await prisma.subclass.findFirstOrThrow({ where: { name: "Way of the Four Elements", classId: monk.id } });
    const fangs = await prisma.grantedAbility.findFirstOrThrow({ where: { name: "Fangs of the Fire Snake", source: "discipline" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-four-elements-3",
        name: "LevelUpTx Four Elements 3",
        rulesEdition: "EDITION_2014",
        experiencePoints: 900, // monk level 3 threshold; hitDice.total 2 → 1 pending
        hitPoints: { current: 16, max: 16, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "monk", subclass: null, classId: monk.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-four-elements-3" } });

    const res = await post("lvtx-four-elements-3", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: fourElements.id,
      subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId: fangs.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body.resources.choicesKnown.fourElementsDisciplines).toHaveLength(1);
    expect(res.body.resources.choicesKnown.fourElementsDisciplines[0].optionId).toBe(fangs.id);
    expect((res.body.availableActions as { key: string }[]).some((a) => a.key === "castDiscipline")).toBe(true);
    expect(await distinctBatchIds("lvtx-four-elements-3")).toHaveLength(1);
  });

  it("5→6: a swap (2 learns + 1 forget netting to the step's count 1) commits atomically", async () => {
    const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
    const fourElementsSub = await prisma.subclass.findFirstOrThrow({ where: { name: "Way of the Four Elements", classId: monk.id } });
    const fangs = await prisma.grantedAbility.findFirstOrThrow({ where: { name: "Fangs of the Fire Snake", source: "discipline" } });
    const water = await prisma.grantedAbility.findFirstOrThrow({ where: { name: "Water Whip", source: "discipline" } });
    const river = await prisma.grantedAbility.findFirstOrThrow({ where: { name: "Shape the Flowing River", source: "discipline" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-four-elements-6",
        name: "LevelUpTx Four Elements 6",
        rulesEdition: "EDITION_2014",
        experiencePoints: 14000, // monk level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          choicesKnown: { fourElementsDisciplines: [{ id: "e-fangs", optionId: fangs.id, name: fangs.name, description: fangs.description }] },
          advancements: [],
        } as unknown as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: "monk", subclass: "way of the four elements", subclassId: fourElementsSub.id, classId: monk.id, position: 0, level: 5 }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-four-elements-6" } });

    const res = await post("lvtx-four-elements-6", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId: water.id },
        { type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId: river.id },
      ],
      subclassChoicesForgotten: [{ type: "forgetSubclassChoice", choiceKey: "fourElementsDisciplines", entryId: "e-fangs" }],
    });
    expect(res.status).toBe(200);
    const known = res.body.resources.choicesKnown.fourElementsDisciplines as { optionId: string }[];
    expect(known.map((k) => k.optionId).sort()).toEqual([river.id, water.id].sort());
    expect(await distinctBatchIds("lvtx-four-elements-6")).toHaveLength(1);

    // Code-review finding (#1516): the assertions above prove the swap
    // SUCCEEDED but never verified the audit event's own shape — a field
    // rename (e.g. eventData.optionName -> choiceName) would pass every
    // assertion above while silently breaking the activity feed and LIFO undo.
    const forgetEvent = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: "lvtx-four-elements-6", type: "forgetSubclassChoice" },
    });
    expect(forgetEvent.summary).toBe(`Removed fourElementsDisciplines choice: ${fangs.name}`);
    expect(forgetEvent.data).toEqual({ choiceKey: "fourElementsDisciplines", entryId: "e-fangs", optionName: fangs.name });
  });
});

// #1516: the maneuver swap (Battle Master) — "Each time you learn new
// maneuvers, you can also replace one maneuver you know with a different
// one" (PHB'14 p.73; SRD 5.2 carries the equivalent grant). Same shape as the
// Way of the Four Elements discipline swap above, scoped to maneuversKnown/
// forgetManeuver. maneuverChoiceCount thresholds: 3@3, 5@7, 7@10, 9@15.
describe("POST …/level-up/transactions — maneuver swap (#1516, Battle Master)", () => {
  async function makeBattleMaster(
    id: string,
    xp: number,
    hitDiceTotal: number,
    entryLevel: number,
    known: { id: string; maneuverId: string; name: string; description: string }[],
  ): Promise<string> {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id,
        name: "LevelUpTx Maneuver Swap",
        experiencePoints: xp,
        hitPoints: { current: 50, max: 50, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: hitDiceTotal, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: known,
          toolProficienciesKnown: [],
          choicesKnown: {},
          advancements: [],
        } as unknown as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: "fighter", subclass: "Battle Master", subclassId: battleMaster.id, classId: fighter.id, position: 0, level: entryLevel }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } });
    return entry.id;
  }

  it("6→7: a swap (3 learns + 1 forget netting to the step's count 2) commits atomically", async () => {
    const catalog = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 6, select: { id: true, name: true, description: true } });
    expect(catalog).toHaveLength(6);
    const known = catalog.slice(0, 3).map((m, i) => ({ id: `k${i}`, maneuverId: m.id, name: m.name, description: m.description }));
    const newPicks = catalog.slice(3, 6);
    const entryId = await makeBattleMaster("lvtx-maneuver-swap-6", 23000, 6, 6, known);

    const res = await post("lvtx-maneuver-swap-6", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      maneuvers: newPicks.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      maneuversForgotten: [{ type: "forgetManeuver", entryId: "k0" }],
    });
    expect(res.status).toBe(200);
    const maneuversKnown = res.body.resources.maneuversKnown as { maneuverId: string }[];
    expect(maneuversKnown).toHaveLength(5); // cap at fighter-7
    expect(maneuversKnown.map((m) => m.maneuverId)).not.toContain(known[0].maneuverId);
    expect(maneuversKnown.map((m) => m.maneuverId)).toEqual(
      expect.arrayContaining(newPicks.map((m) => m.id)),
    );
    expect(await distinctBatchIds("lvtx-maneuver-swap-6")).toHaveLength(1);

    // Code-review finding: the assertions above prove the swap SUCCEEDED but
    // never verified the audit event's own shape — a field rename (e.g.
    // eventData.maneuverName -> choiceName) would pass every assertion above
    // while silently breaking the activity feed and LIFO undo (both read
    // this event's summary/data).
    const forgetEvent = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: "lvtx-maneuver-swap-6", type: "forgetManeuver" },
    });
    expect(forgetEvent.summary).toBe(`Forgot maneuver: ${known[0].name}`);
    expect(forgetEvent.data).toEqual({ entryId: "k0", maneuverName: known[0].name });
  });

  it("6→7: rejects two forgets in one level-up", async () => {
    const catalog = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 7, select: { id: true, name: true, description: true } });
    expect(catalog).toHaveLength(7);
    const known = catalog.slice(0, 3).map((m, i) => ({ id: `k${i}`, maneuverId: m.id, name: m.name, description: m.description }));
    const newPicks = catalog.slice(3, 7); // 4 learns, net-matches the step count (2) against 2 forgets
    const entryId = await makeBattleMaster("lvtx-maneuver-swap-two-forgets", 23000, 6, 6, known);

    const res = await post("lvtx-maneuver-swap-two-forgets", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      maneuvers: newPicks.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      maneuversForgotten: [
        { type: "forgetManeuver", entryId: "k0" },
        { type: "forgetManeuver", entryId: "k1" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most one/i);
  });

  // Fighter-3→4 is not a maneuver-growth level (3@3, still 3@4) — no
  // "maneuvers" step exists, so PHB'14's "each time you learn new maneuvers"
  // condition never fires. Level 4 is also an ASI level, so `advancement` is
  // included to isolate the forget rejection.
  it("3→4: rejects a forget — the level grants no new maneuvers", async () => {
    const catalog = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true, name: true, description: true } });
    const known = catalog.map((m, i) => ({ id: `k${i}`, maneuverId: m.id, name: m.name, description: m.description }));
    const entryId = await makeBattleMaster("lvtx-maneuver-no-step", 2700, 3, 3, known);

    const res = await post("lvtx-maneuver-no-step", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      maneuversForgotten: [{ type: "forgetManeuver", entryId: "k0" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not allow swapping a maneuver/i);
  });

  // #1516 decision point 1 (level-down repair): clampChoicesToCaps-style
  // trimming already applies to maneuversKnown via reconcileManeuvers
  // (level-reconciliation.ts, unchanged by this issue — it never calls
  // applyForgetManeuverOp). The bounded "repair" the decision calls for is the
  // ORDINARY learn-time step: after a level-down trims maneuversKnown to the
  // new cap, leveling back up re-offers exactly the trimmed count via the same
  // "maneuvers" step (delta between the level-derived caps) — no bespoke
  // repair mechanism needed. This is the mutation-proof regression latch: if a
  // future change moved this issue's guard INSIDE the shared trim primitive
  // (clampChoicesToCaps/reconcileManeuvers) instead of the op boundary, the
  // XP-drop step below would break.
  it("level-down trims to the level-6 cap; leveling back up offers exactly the trimmed count", async () => {
    const catalog = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 5, select: { id: true, name: true, description: true } });
    expect(catalog).toHaveLength(5);
    const known = catalog.map((m, i) => ({ id: `k${i}`, maneuverId: m.id, name: m.name, description: m.description }));
    const CHAR_ID = "lvtx-maneuver-repair";
    const entryId = await makeBattleMaster(CHAR_ID, 23000, 7, 7, known); // level 7, cap 5, at cap

    const dropped = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/experience`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: 14000 }] }); // level 6 threshold → cap 3
    expect(dropped.status).toBe(200);
    expect(dropped.body.resources.maneuversKnown).toHaveLength(3);
    expect(dropped.body.hitDice.total).toBe(6);
    expect(dropped.body.pendingLevelUps).toBe(0);

    // XP back up to the level-7 threshold — hitDice.total is untouched (HP
    // level-up is a separate explicit action, docs/leveling.md), so this
    // reopens exactly ONE pending level-up (6→7) for the ceremony below.
    const raised = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/experience`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: 23000 }] });
    expect(raised.status).toBe(200);
    expect(raised.body.hitDice.total).toBe(6);
    expect(raised.body.pendingLevelUps).toBe(1);

    const plan = await getPlan(CHAR_ID).query({ classEntryId: entryId });
    expect(plan.status).toBe(200);
    const maneuversStep = (plan.body.steps as Array<{ kind: string; count?: number; meta?: { canSwap?: boolean } }>)
      .find((s) => s.kind === "maneuvers");
    expect(maneuversStep).toMatchObject({ count: 2, meta: { canSwap: true } });

    const freshCatalog = await prisma.grantedAbility.findMany({
      where: { source: "maneuver", id: { notIn: known.map((k) => k.maneuverId) } },
      take: 2,
      select: { id: true },
    });
    expect(freshCatalog).toHaveLength(2);
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      maneuvers: freshCatalog.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
    });
    expect(res.status).toBe(200);
    expect(res.body.resources.maneuversKnown).toHaveLength(5);
    expect(res.body.resources.maneuverChoiceCount).toBe(5);
  });
});

// #1131: cantrip progression through the ceremony. Warlock gains its 3rd cantrip
// and a prepared spell at level 4 (plus an ASI), so the newSpells step now carries
// a cantrip pick alongside the leveled pick.
describe("POST …/level-up/transactions — Warlock 3→4 cantrip + spell (#1131)", () => {
  const CHAR_ID = "lvtx-warlock-4";

  beforeEach(async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    const theFiend = (await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Warlock",
        experiencePoints: 2700, // level 4 threshold; hitDice.total 3 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d8", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "warlock", subclass: "The Fiend", subclassId: theFiend, classId: warlock.id, position: 0, level: 3 }] },
      },
    });
  });

  it("commits one new cantrip and one new spell together with hp + ASI", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // #1713 forked several Warlock-list cantrips/spells (Mage Hand, Charm
    // Person, ...) — this fixture defaults to EDITION_2024, so pin the fetch.
    const spell = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024" }, select: { id: true, name: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "warlock" } }, level: 0, edition: "EDITION_2024" }, select: { id: true, name: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    const bookNames = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(bookNames).toContain(spell.name);
    expect(bookNames).toContain(cantrip.name);
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("rejects a leveled spell submitted as a cantrip (400)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024" }, take: 2, select: { id: true } });
    expect(spells).toHaveLength(2);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spells[0].id }],
      cantripsLearned: [{ type: "learnSpell", spellId: spells[1].id }], // level-1 spell in the cantrip slot
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantrip/i);
    // Nothing committed — the level check runs before the tx opens.
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("rejects a cantrip submitted as a leveled spell (400)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Two distinct cantrips: one misplaced in the leveled slot, one valid in the cantrip slot.
    const [misplaced, validCantrip] = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 0, edition: "EDITION_2024" }, take: 2, select: { id: true } });
    expect(misplaced.id).not.toBe(validCantrip.id);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: misplaced.id }], // level-0 spell in the leveled slot
      cantripsLearned: [{ type: "learnSpell", spellId: validCantrip.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantrip/i);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// #1631: The Fiend's PHB'14 "Expanded Spell List" widens the CHOOSABLE pool a
// known caster's leveled pick may come from, alongside the base Warlock list
// (spellLists) — Burning Hands/Command are NOT on the base Warlock list but
// ARE legal picks for a 2014 Fiend Warlock, still costing the ordinary
// spells-known slot (never a free grant — granted-spells-domains.test.ts's
// "receives NONE... for free" is the sibling proof of that half).
describe("POST …/level-up/transactions — subclass spell-list expansion (#1631)", () => {
  const CHAR_ID = "lvtx-1631-fiend-2";

  beforeEach(async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    const theFiend = (await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Fiend1631",
        rulesEdition: "EDITION_2014",
        experiencePoints: 300, // level 2 threshold; hitDice.total 1 → 1 pending
        hitPoints: { current: 14, max: 14, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "warlock", subclass: "The Fiend", subclassId: theFiend, classId: warlock.id, position: 0, level: 1 }] },
      },
    });
  });

  it("a 2014 Fiend Warlock 1→2 may pick Burning Hands (off the base Warlock list) as its new known spell", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Burning Hands is a genuine 2014/2024 fork — pin EDITION_2014 (the
    // character's own edition), same rationale as the 2024 test below.
    const burningHands = await prisma.spell.findFirstOrThrow({
      where: { name: "Burning Hands", edition: "EDITION_2014", NOT: { classMemberships: { some: { className: "warlock" } } } },
      select: { id: true, name: true },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: burningHands.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.spellcasting.spells.map((s: { name: string }) => s.name)).toContain(burningHands.name);
  });

  it("the same off-list pick is rejected 400 for a 2024 Fiend Warlock (no list-expansion mechanism — Fiend Spells is a grant, never a pick)", async () => {
    await prisma.character.update({ where: { id: CHAR_ID }, data: { rulesEdition: "EDITION_2024" } });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Burning Hands is a genuine 2014/2024 fork — pin EDITION_2024 (the
    // character's own edition) so this exercises assertOnSpellList, not the
    // unrelated cross-edition-fork rejection (#1712).
    const burningHands = await prisma.spell.findFirstOrThrow({
      where: { name: "Burning Hands", edition: "EDITION_2024", NOT: { classMemberships: { some: { className: "warlock" } } } },
      select: { id: true },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsLearned: [{ type: "learnSpell", spellId: burningHands.id }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell list/i);
  });
});

// #1712: cross-edition admission for the level-up learn path —
// loadPickCatalogRows rejects a submitted spellId that's provably the WRONG
// edition's fork of a name (a same-named row the character's OWN edition
// actually resolves to exists). Reuses the Warlock 3→4 fixture shape above.
// A dedicated fixture fork (rather than a real catalog name) keeps this
// mechanism proof independent of which real spells #1713+'s content slices
// happen to fork; the Bard Magical Secrets and #1509 known-caster describe
// blocks above prove a 2014 character's level-up accepts today's real
// catalog (forked or not) unchanged.
describe("POST …/level-up/transactions — cross-edition spell-fork rejection (#1712)", () => {
  const CHAR_ID = "lvtx-1712-fork";
  const FORK_NAME = "LevelUpTx1712 Fork Cantrip";

  beforeEach(async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    const theFiend = (await prisma.subclass.findFirstOrThrow({ where: { classId: warlock.id, name: "The Fiend" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx1712 Warlock",
        experiencePoints: 2700, // level 4 threshold; hitDice.total 3 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d8", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "warlock", subclass: "The Fiend", subclassId: theFiend, classId: warlock.id, position: 0, level: 3 }] },
      },
    });
  });

  afterEach(async () => {
    // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
    // #1796) — the reverse cascade doesn't exist (the supertype stays
    // closed), so a plain `spell.deleteMany` alone would orphan the entry.
    await prisma.catalogEntry.deleteMany({ where: { name: FORK_NAME, kind: "SPELL" } });
  });

  async function seedFork() {
    const row2014 = {
      name: FORK_NAME, level: 0, school: "evocation" as const, castingTime: "1 action", range: "30 feet",
      duration: "Instantaneous", description: "The PHB'14 text.", concentration: false, ritual: false, cantripScaling: true,
    };
    const row2024 = { ...row2014, description: "The SRD 5.2 text." };
    // catalogEntryId (#1796) is resolved first, per edition fork — required,
    // no default, and each fork is its own distinct CatalogEntry (business
    // key includes edition).
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

  it("rejects a 2024 character's level-up submitting the 2014 fork's id, naming the spell", async () => {
    const { fork2014 } = await seedFork();
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spell = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: fork2014.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`${FORK_NAME} is 2014 rules content, not usable by a 2024 rules character`);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("admits the character's OWN edition fork — the rejection is fork-specific, not a blanket cross-edition ban", async () => {
    const { fork2024 } = await seedFork();
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spell = await prisma.spell.findFirstOrThrow({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024" }, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: fork2024.id }],
    });
    expect(res.status, res.body.error ?? "").toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(FORK_NAME);
  });
});

// #1131: adding a first level in a new class routes through the SAME ceremony
// (target {kind:"new"}), not a creation-only fork. A caster second class picks
// its level-1 spells + cantrips; a Fighter second class commits its fighting style.
describe("POST …/level-up/transactions — multiclass add via ceremony (#1131)", () => {
  const CHAR_ID = "lvtx-mc-add";

  beforeEach(async () => {
    const rogue = await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } });
    const thief = (await prisma.subclass.findFirstOrThrow({ where: { classId: rogue.id, name: "Thief" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Multiclass",
        experiencePoints: 14000, // level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d8", spent: 0 },
        // High across the board so any multiclass prerequisite is met.
        abilityScores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "rogue", subclass: "Thief", subclassId: thief, classId: rogue.id, position: 0, level: 5 }] },
      },
    });
  });

  it("adds a Warlock second class and applies its 2 cantrips + 2 spells", async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    const cantrips = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 0, edition: "EDITION_2024" }, take: 2, select: { id: true } });
    const spells = await prisma.spell.findMany({ where: { classMemberships: { some: { className: "warlock" } }, level: 1, edition: "EDITION_2024" }, take: 2, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: warlock.id },
      hp: { method: "average" },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: cantrips.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name.toLowerCase())).toContain("warlock");
    // The 2 cantrips + 2 leveled spells are all learned into the new class's book.
    const book = res.body.spellcasting.spells as Array<{ level: number }>;
    expect(book).toHaveLength(4);
    expect(book.filter((s) => s.level === 0)).toHaveLength(2);
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("adds a Fighter second class and commits its fighting-style feat against the new entry", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    // Pinned to EDITION_2024 (#1311): these fixtures never set rulesEdition, so
    // they default to EDITION_2024, and a bare name+category match became
    // ambiguous the moment a 2014 "Defense" row exists alongside it.
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style", edition: "EDITION_2024" } });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name.toLowerCase())).toContain("fighter");
    expect(res.body.advancements.some((a: { slot?: string; featName?: string }) => a.slot === "fightingStyle" && a.featName === "Defense")).toBe(true);
  });
});

// #1380: the ceremony previews the HP gain from the plan's `hitPoints` meta, so
// preview and commit must be the same number by construction — one resolved die
// through one levelUpHpGain. These read the real GET response rather than a
// recomputed expectation, which is what makes drift observable.
describe("POST …/level-up/transactions — the served HP meta equals the committed gain (#1380)", () => {
  async function servedHpMeta(characterId: string, query = ""): Promise<{ die: string; averageGain: number }> {
    const res = await supertest(app)
      .get(`/api/characters/${characterId}/level-up/plan${query}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    const step = (res.body.steps as { kind: string; meta?: Record<string, unknown> }[]).find((s) => s.kind === "hitPoints");
    return { die: String(step?.meta?.die), averageGain: Number(step?.meta?.averageGain) };
  }

  it("single-class Fighter 6→7: hitPoints.max rises by exactly meta.averageGain", async () => {
    const CHAR_ID = "lvtx-hp-meta-single";
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    // No subclass (#1148): this fixture is L6→7 in 2024, exactly the level
    // Champion's Additional Fighting Style grants a second slot, and also the
    // level Battle Master's maneuver count grows — either would ALSO need its
    // own choice op in the level-up submission (see the "adds a Fighter
    // second class"/maneuver-swap tests elsewhere in this file), which is
    // orthogonal to what this test asserts (HP preview == commit). Fine for
    // this fixture: the subclass gate (L3) is long past, and no OTHER step
    // here depends on which subclass is chosen.
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx HpMeta Single",
        experiencePoints: 23000, // level 7; hitDice.total 6 → 1 pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 6, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", classId: fighter.id, position: 0, level: 6 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });

    const meta = await servedHpMeta(CHAR_ID, `?classEntryId=${entry.id}`);
    expect(meta.die).toBe("d10");

    const res = await post(CHAR_ID, { target: { kind: "existing", classEntryId: entry.id }, hp: { method: "average" } });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(60 + meta.averageGain);
  });

  it("multiclass Fighter 1→2 under a d6 Wizard primary: the d10 preview is the d10 commit", async () => {
    const CHAR_ID = "lvtx-hp-meta-multi";
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const evocation = (await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx HpMeta Multi",
        experiencePoints: 23000, // level 7; hitDice.total 6 → 1 pending
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        // The persisted (position-0) die is the Wizard's d6 — the wrong answer here.
        hitDice: { total: 6, die: "d6", spent: 0 },
        abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocation, classId: wizard.id, position: 0, level: 5 },
            { name: "fighter", subclass: null, classId: fighter.id, position: 1, level: 1 },
          ],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });

    const meta = await servedHpMeta(CHAR_ID, `?classEntryId=${entry.id}`);
    expect(meta.die).toBe("d10");

    const res = await post(CHAR_ID, { target: { kind: "existing", classEntryId: entry.id }, hp: { method: "average" } });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(40 + meta.averageGain);
  });
});
