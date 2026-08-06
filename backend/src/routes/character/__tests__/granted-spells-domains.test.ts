/**
 * Official granted spell lists (#913) — end-to-end over the SEEDED rows.
 *
 * Unlike spellcasting.test.ts (which seeds its own test subclass grant), this
 * links a character to the real seeded Subclass rows + their
 * SubclassGrantedSpell rows, proving the #912 catalog expansion + #913 seed
 * content resolve through the live serialize path. Asserts the domain spells
 * surface as always-prepared, level-gated grants marked source:"subclass" (the
 * marker the prepared-cap logic excludes on).
 *
 * #1626 adds Oath of Devotion / Trickery Domain / The Fiend alongside the
 * original Life Domain coverage: each of these four subclasses re-authors its
 * SRD 5.2 granted-spell list on a retagged EDITION_2024 row beside the
 * existing EDITION_2014 row (spell/gateLevel unchanged) — every test below
 * that names a 2024 character also asserts the superseded 2014 spell is
 * ABSENT, the specific failure a partial retag (add-2024-without-retag)
 * produces (#1626 AC).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-granted-domains";
let COOKIE: string;
const CHAR_ID = "test-granted-domains-1";

// XP thresholds (levelForExperience): L1=0, L5=6500, L7=34000, L9=48000.
const XP_LVL_1 = 0;
const XP_LVL_5 = 6500;
const XP_LVL_7 = 34000;
const XP_LVL_9 = 48000;

let clericClassId: string;
let lifeDomainId: string;
let trickeryDomainId: string;
let paladinClassId: string;
let devotionId: string;
let warlockClassId: string;
let fiendId: string;

async function requireClass(name: string): Promise<string> {
  const cls = await prisma.characterClass.findUnique({ where: { name }, select: { id: true } });
  if (!cls) throw new Error(`${name} class not seeded — run \`prisma db seed\` before tests`);
  return cls.id;
}

// findFirst, not findUnique: the classId_name compound-key shorthand can't
// express a null edition (#1306).
async function requireSharedSubclass(classId: string, name: string): Promise<string> {
  const sub = await prisma.subclass.findFirst({ where: { classId, name, edition: null }, select: { id: true } });
  if (!sub) throw new Error(`${name} subclass not seeded — run \`prisma db seed\` before tests`);
  return sub.id;
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  clericClassId = await requireClass("Cleric");
  lifeDomainId = await requireSharedSubclass(clericClassId, "Life Domain");
  trickeryDomainId = await requireSharedSubclass(clericClassId, "Trickery Domain");

  paladinClassId = await requireClass("Paladin");
  devotionId = await requireSharedSubclass(paladinClassId, "Oath of Devotion");

  warlockClassId = await requireClass("Warlock");
  fiendId = await requireSharedSubclass(warlockClassId, "The Fiend");
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

interface CasterSpec {
  className: string;
  classId: string;
  subclassName: string;
  subclassId: string;
  savingThrowProficiencies: string[];
}

async function createCaster(spec: CasterSpec, xp: number, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  await prisma.character.create({
    data: {
      id: CHAR_ID,
      name: `Test ${spec.subclassName}`,
      alignment: "Lawful Good",
      rulesEdition,
      experiencePoints: xp,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 30, max: 30, temp: 0 },
      hitDice: { total: 9, die: "d8" },
      abilityScores: {
        strength: 10, dexterity: 12, constitution: 14,
        intelligence: 10, wisdom: 16, charisma: 16,
      },
      savingThrowProficiencies: spec.savingThrowProficiencies,
      skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      ownerId: OWNER_ID,
      spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
      classEntries: {
        // ClassEntry.level is left at its default (1): the single-class serialize
        // path derives level from experiencePoints (the per-class column can be
        // stale), so XP alone drives the gate. A multiclass test would need to
        // set per-entry `level` — that path uses e.level, not the XP total.
        create: [{
          name: spec.className.toLowerCase(),
          classId: spec.classId,
          position: 0,
          subclass: spec.subclassName.toLowerCase(),
          subclassId: spec.subclassId,
        }],
      },
    },
  });
}

async function createLifeCleric(xp: number, rulesEdition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024") {
  await createCaster(
    { className: "Cleric", classId: clericClassId, subclassName: "Life Domain", subclassId: lifeDomainId, savingThrowProficiencies: ["wisdom", "charisma"] },
    xp,
    rulesEdition,
  );
}

interface GrantedSpell { name: string; level: number; source?: string; prepared?: boolean }
async function grantedSpells(): Promise<GrantedSpell[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHAR_ID}`);
  expect(res.status).toBe(200);
  return ((res.body.spellcasting?.spells ?? []) as GrantedSpell[]).filter((s) => s.source === "subclass");
}

describe("Life Domain granted spells (#913, #1626)", () => {
  // EDITION_2014 explicitly (#1625): this is the byte-identical PHB'14 domain
  // list, on the retagged EDITION_2014 row (spell/gateLevel unchanged, #1626).
  it("a 2014 Life Cleric surfaces the PHB'14 domain list at cleric level 5, always-prepared", async () => {
    await createLifeCleric(XP_LVL_5, "EDITION_2014");
    const granted = await grantedSpells();
    const names = granted.map((s) => s.name).sort();
    // All six rows gate at 3 (Bless/Cure Wounds/Lesser Restoration/Spiritual
    // Weapon) and 5 (Beacon of Hope/Revivify) — subclass grants start at the
    // level-3 subclass pick (#1128), not at 1.
    expect(names).toEqual([
      "Beacon of Hope",
      "Bless",
      "Cure Wounds",
      "Lesser Restoration",
      "Revivify",
      "Spiritual Weapon",
    ]);
    // gate 7+ (Death Ward, Mass Cure Wounds, …) not yet available.
    expect(names).not.toContain("Death Ward");
    expect(names).not.toContain("Mass Cure Wounds");
    // Always-prepared grants, marked source:"subclass" (excluded from the prepared cap).
    expect(granted.every((s) => s.prepared === true && s.source === "subclass")).toBe(true);
  });

  it("gates all grants out at cleric level 1 (subclass grants at 3, #1128)", async () => {
    await createLifeCleric(XP_LVL_1);
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([]);
  });

  // SRD 5.2 p.40 "Life Domain Spells" table, transcribed verbatim in
  // cleric-features.ts — the 2024 twin of the row above, on a NEW
  // EDITION_2024 row (#1626). Asserts the full L3/5/7/9 list AND that none of
  // the four superseded 2014 names leak through (the partial-retag failure).
  it("a 2024 Life Cleric surfaces the SRD 5.2 domain list at cleric level 9, not the superseded 2014 names", async () => {
    await createLifeCleric(XP_LVL_9, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([
      "Aid",
      "Aura of Life",
      "Bless",
      "Cure Wounds",
      "Death Ward",
      "Greater Restoration",
      "Lesser Restoration",
      "Mass Cure Wounds",
      "Mass Healing Word",
      "Revivify",
    ]);
    expect(names).not.toContain("Spiritual Weapon");
    expect(names).not.toContain("Beacon of Hope");
    expect(names).not.toContain("Guardian of Faith");
    expect(names).not.toContain("Raise Dead");
  });
});

describe("Oath of Devotion granted spells (#913, #1626)", () => {
  async function createDevotionPaladin(xp: number, edition: "EDITION_2014" | "EDITION_2024") {
    await createCaster(
      { className: "Paladin", classId: paladinClassId, subclassName: "Oath of Devotion", subclassId: devotionId, savingThrowProficiencies: ["wisdom", "charisma"] },
      xp,
      edition,
    );
  }

  // PHB'14 p.87 "Oath Spells" — byte-identical list on the retagged
  // EDITION_2014 row (#1626).
  it("a 2014 Devotion Paladin surfaces the PHB'14 oath list at paladin level 5", async () => {
    await createDevotionPaladin(XP_LVL_5, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual(["Lesser Restoration", "Protection from Evil and Good", "Sanctuary", "Zone of Truth"]);
  });

  // SRD 5.2 pp.49-50 "Oath of Devotion Spells" — L3 swaps Sanctuary for
  // Shield of Faith, L5 swaps Lesser Restoration for Aid (#1626).
  it("a 2024 Devotion Paladin surfaces the SRD 5.2 oath list at paladin level 5, not the superseded 2014 names", async () => {
    await createDevotionPaladin(XP_LVL_5, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual(["Aid", "Protection from Evil and Good", "Shield of Faith", "Zone of Truth"]);
    expect(names).not.toContain("Sanctuary");
    expect(names).not.toContain("Lesser Restoration");
  });
});

describe("Trickery Domain granted spells (#913, #1626)", () => {
  async function createTrickeryCleric(xp: number, edition: "EDITION_2014" | "EDITION_2024") {
    await createCaster(
      { className: "Cleric", classId: clericClassId, subclassName: "Trickery Domain", subclassId: trickeryDomainId, savingThrowProficiencies: ["wisdom", "charisma"] },
      xp,
      edition,
    );
  }

  // PHB'14 p.63 "Domain Spells" — byte-identical list on the retagged
  // EDITION_2014 row (#1626).
  it("a 2014 Trickery Cleric surfaces the PHB'14 domain list at cleric level 7", async () => {
    await createTrickeryCleric(XP_LVL_7, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([
      "Blink",
      "Charm Person",
      "Dimension Door",
      "Disguise Self",
      "Dispel Magic",
      "Mirror Image",
      "Pass without Trace",
      "Polymorph",
    ]);
  });

  // Mirror-sourced SRD 5.2 "Trickery Domain Spells" (owner decision #1225,
  // cleric-features.ts) — L3 swaps Mirror Image for Invisibility, L5 swaps
  // Blink for Hypnotic Pattern and Dispel Magic for Nondetection, L7 swaps
  // Polymorph for Confusion (#1626).
  it("a 2024 Trickery Cleric surfaces the SRD 5.2 domain list at cleric level 7, not the superseded 2014 names", async () => {
    await createTrickeryCleric(XP_LVL_7, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([
      "Charm Person",
      "Confusion",
      "Dimension Door",
      "Disguise Self",
      "Hypnotic Pattern",
      "Invisibility",
      "Nondetection",
      "Pass without Trace",
    ]);
    expect(names).not.toContain("Mirror Image");
    expect(names).not.toContain("Blink");
    expect(names).not.toContain("Dispel Magic");
    expect(names).not.toContain("Polymorph");
  });
});

describe("The Fiend granted spells (#913, #1626)", () => {
  async function createFiendWarlock(xp: number, edition: "EDITION_2014" | "EDITION_2024") {
    await createCaster(
      { className: "Warlock", classId: warlockClassId, subclassName: "The Fiend", subclassId: fiendId, savingThrowProficiencies: ["wisdom", "charisma"] },
      xp,
      edition,
    );
  }

  // PHB'14 "Expanded Spell List" — byte-identical list (character-level gates
  // here are the deliberately-deferred 2024 shift, #1626 issue body "second
  // axis") on the retagged EDITION_2014 row.
  it("a 2014 Fiend Warlock surfaces the PHB'14 fiend list at warlock level 9", async () => {
    await createFiendWarlock(XP_LVL_9, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([
      "Blindness/Deafness",
      "Burning Hands",
      "Command",
      "Fire Shield",
      "Fireball",
      "Flame Strike",
      "Hallow",
      "Scorching Ray",
      "Stinking Cloud",
      "Wall of Fire",
    ]);
  });

  // SRD 5.2 pp.75-76 "Fiend Spells" — L3 swaps Blindness/Deafness for
  // Suggestion, L9 swaps Flame Strike for Geas and Hallow for Insect Plague
  // (#1626).
  it("a 2024 Fiend Warlock surfaces the SRD 5.2 fiend list at warlock level 9, not the superseded 2014 names", async () => {
    await createFiendWarlock(XP_LVL_9, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([
      "Burning Hands",
      "Command",
      "Fire Shield",
      "Fireball",
      "Geas",
      "Insect Plague",
      "Scorching Ray",
      "Stinking Cloud",
      "Suggestion",
      "Wall of Fire",
    ]);
    expect(names).not.toContain("Blindness/Deafness");
    expect(names).not.toContain("Flame Strike");
    expect(names).not.toContain("Hallow");
  });
});

// Mechanism proof for #1625 on the serialize path, independent of what #1626
// does to the seeded content: fork rows onto the REAL Life Domain subclass and
// prove each edition's character is served the shared rows plus exactly its
// own edition's row.
describe("per-edition grant filtering on the serialize path (#1625)", () => {
  let forked2014SpellId: string;
  let forked2024SpellId: string;

  beforeAll(async () => {
    const spellId = async (name: string) => (await prisma.spell.findFirstOrThrow({ where: { name }, select: { id: true } })).id;
    forked2014SpellId = await spellId("Charm Person");
    forked2024SpellId = await spellId("Disguise Self");
    await prisma.subclassGrantedSpell.createMany({
      data: [
        { subclassId: lifeDomainId, spellId: forked2014SpellId, gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2014" },
        { subclassId: lifeDomainId, spellId: forked2024SpellId, gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2024" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.subclassGrantedSpell.deleteMany({
      where: { subclassId: lifeDomainId, spellId: { in: [forked2014SpellId, forked2024SpellId] } },
    });
  });

  it("a 2024 cleric receives the shared rows plus the EDITION_2024 row and not the EDITION_2014 row", async () => {
    await createLifeCleric(XP_LVL_5, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name);
    expect(names).toContain("Disguise Self");
    expect(names).not.toContain("Charm Person");
    expect(names).toContain("Bless"); // shared row still served
  });

  it("a 2014 cleric receives the shared rows plus the EDITION_2014 row and not the EDITION_2024 row", async () => {
    await createLifeCleric(XP_LVL_5, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name);
    expect(names).toContain("Charm Person");
    expect(names).not.toContain("Disguise Self");
    expect(names).toContain("Bless");
  });
});
