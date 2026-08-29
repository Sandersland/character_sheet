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

const XP_LVL_1 = 0;
const XP_LVL_2 = 300;
const XP_LVL_3 = 900;
const XP_LVL_5 = 6500;
const XP_LVL_7 = 23000;
const XP_LVL_9 = 48000;

let clericClassId: string;
let lifeDomainId: string;
let trickeryDomainId: string;
let paladinClassId: string;
let devotionId: string;
let warlockClassId: string;
let fiendId: string;
let archfeyId: string;
let greatOldOneId: string;
let rogueClassId: string;
let arcaneTricksterId: string;
let wizardClassId: string;
let illusionId: string;

async function requireClass(name: string): Promise<string> {
  const cls = await prisma.characterClass.findUnique({ where: { name }, select: { id: true } });
  if (!cls) throw new Error(`${name} class not seeded — run \`prisma db seed\` before tests`);
  return cls.id;
}

// findFirst, not findUnique: the classId_name compound key cannot express a null edition (#1306).
async function requireSharedSubclass(classId: string, name: string): Promise<string> {
  const sub = await prisma.subclass.findFirst({ where: { classId, name, edition: null }, select: { id: true } });
  if (!sub) throw new Error(`${name} subclass not seeded — run \`prisma db seed\` before tests`);
  return sub.id;
}

// Archfey/Great Old One are EDITION_2014-only rows (#1233); requireSharedSubclass's edition:null never matches them.
async function require2014Subclass(classId: string, name: string): Promise<string> {
  const sub = await prisma.subclass.findFirst({ where: { classId, name, edition: "EDITION_2014" }, select: { id: true } });
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
  archfeyId = await require2014Subclass(warlockClassId, "The Archfey");
  greatOldOneId = await require2014Subclass(warlockClassId, "The Great Old One");

  rogueClassId = await requireClass("Rogue");
  arcaneTricksterId = await requireSharedSubclass(rogueClassId, "Arcane Trickster");

  wizardClassId = await requireClass("Wizard");
  illusionId = await requireSharedSubclass(wizardClassId, "School of Illusion");
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

async function createCaster(
  spec: CasterSpec,
  xp: number,
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  storedSpells: unknown[] = [],
) {
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
      spellcasting: { slotsUsed: {}, spells: storedSpells } as Prisma.InputJsonValue,
      classEntries: {
        // ClassEntry.level stays at its default; single-class serialize derives level from XP — a multiclass test must set per-entry level instead.
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
async function fullCharacter(): Promise<{ spells: GrantedSpell[]; preparedSpellCount?: number; preparedSpellLimit?: number | null }> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHAR_ID}`);
  expect(res.status).toBe(200);
  return res.body.spellcasting ?? { spells: [] };
}
async function grantedSpells(): Promise<GrantedSpell[]> {
  const { spells } = await fullCharacter();
  return spells.filter((s) => s.source === "subclass");
}
// Every source, not just grants — the dedup test needs the stored (already-known) copy to survive too.
async function allSpells(): Promise<GrantedSpell[]> {
  return (await fullCharacter()).spells;
}

describe("Life Domain granted spells (#913, #1626)", () => {
  it("a 2014 Life Cleric surfaces the PHB'14 domain list at cleric level 5, always-prepared", async () => {
    await createLifeCleric(XP_LVL_5, "EDITION_2014");
    const granted = await grantedSpells();
    const names = granted.map((s) => s.name).sort();

    expect(names).toEqual([
      "Beacon of Hope",
      "Bless",
      "Cure Wounds",
      "Lesser Restoration",
      "Revivify",
      "Spiritual Weapon",
    ]);

    expect(names).not.toContain("Death Ward");
    expect(names).not.toContain("Mass Cure Wounds");

    expect(granted.every((s) => s.prepared === true && s.source === "subclass")).toBe(true);
  });

  it("gates all grants out at cleric level 1 (subclass grants at 3, #1128)", async () => {
    await createLifeCleric(XP_LVL_1);
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([]);
  });

  // SRD 5.2 p.40 "Life Domain Spells" table, transcribed verbatim in cleric-features.ts (#1626).
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

  // PHB'14 p.87 "Oath Spells" — byte-identical on the retagged EDITION_2014 row (#1626).
  it("a 2014 Devotion Paladin surfaces the PHB'14 oath list at paladin level 5", async () => {
    await createDevotionPaladin(XP_LVL_5, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual(["Lesser Restoration", "Protection from Evil and Good", "Sanctuary", "Zone of Truth"]);
  });

  // SRD 5.2 pp.49-50 "Oath of Devotion Spells" — L3 swaps Sanctuary for Shield of Faith, L5 swaps Lesser Restoration for Aid (#1626).
  it("a 2024 Devotion Paladin surfaces the SRD 5.2 oath list at paladin level 5, not the superseded 2014 names", async () => {
    await createDevotionPaladin(XP_LVL_5, "EDITION_2024");
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual(["Aid", "Protection from Evil and Good", "Shield of Faith", "Zone of Truth"]);
    expect(names).not.toContain("Sanctuary");
    expect(names).not.toContain("Lesser Restoration");
  });

  // A leveled grant is needed to exercise derivePreparedFields' source==null guard — a cantrip cannot distinguish it from the level>0 filter.
  it("a leveled subclass grant doesn't count against the prepared-spell cap either", async () => {
    await createDevotionPaladin(XP_LVL_5, "EDITION_2014");
    const { preparedSpellCount, spells } = await fullCharacter();
    const grant = spells.find((s) => s.name === "Protection from Evil and Good");
    expect(grant?.source).toBe("subclass");
    expect(grant?.level).toBeGreaterThan(0);
    expect(preparedSpellCount).toBe(0);
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

  // PHB'14 p.63 "Domain Spells" — byte-identical on the retagged EDITION_2014 row (#1626).
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

  // Mirror-sourced SRD 5.2 "Trickery Domain Spells" (owner decision #1225, cleric-features.ts) — L3/5/7 name swaps (#1626).
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

describe("The Fiend granted spells (#913, #1626, #1631)", () => {
  async function createFiendWarlock(xp: number, edition: "EDITION_2014" | "EDITION_2024") {
    await createCaster(
      { className: "Warlock", classId: warlockClassId, subclassName: "The Fiend", subclassId: fiendId, savingThrowProficiencies: ["wisdom", "charisma"] },
      xp,
      edition,
    );
  }

  // PHB'14's Expanded Spell List is a picker-only list EXPANSION (SubclassSpellListExpansion), not a free grant (SubclassGrantedSpell) — a 2014 Fiend gets none of these ten for free (#1631).
  it("a 2014 Fiend Warlock receives NONE of the ten patron spells for free at warlock level 9", async () => {
    await createFiendWarlock(XP_LVL_9, "EDITION_2014");
    const names = (await grantedSpells()).map((s) => s.name);
    expect(names).toEqual([]);
  });

  // SRD 5.2 pp.75-76 "Fiend Spells" is genuinely always-prepared (#1631) — L3/9 name swaps (#1626).
  it("a 2024 Fiend Warlock still receives Fiend Spells as always-prepared grants at warlock level 9, not the 2014 names", async () => {
    await createFiendWarlock(XP_LVL_9, "EDITION_2024");
    const granted = await grantedSpells();
    const names = granted.map((s) => s.name).sort();
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

    expect(granted.every((s) => s.prepared === true && s.source === "subclass")).toBe(true);
  });
});

describe("The Archfey / The Great Old One granted spells (#1631)", () => {
  it("a 2014 Archfey Warlock receives NONE of the ten patron spells for free at warlock level 9", async () => {
    await createCaster(
      { className: "Warlock", classId: warlockClassId, subclassName: "The Archfey", subclassId: archfeyId, savingThrowProficiencies: ["wisdom", "charisma"] },
      XP_LVL_9,
      "EDITION_2014",
    );
    const names = (await grantedSpells()).map((s) => s.name);
    expect(names).toEqual([]);
  });

  it("a 2014 Great Old One Warlock receives NONE of the ten patron spells for free at warlock level 9", async () => {
    await createCaster(
      { className: "Warlock", classId: warlockClassId, subclassName: "The Great Old One", subclassId: greatOldOneId, savingThrowProficiencies: ["wisdom", "charisma"] },
      XP_LVL_9,
      "EDITION_2014",
    );
    const names = (await grantedSpells()).map((s) => s.name);
    expect(names).toEqual([]);
  });
});

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

describe("Arcane Trickster granted spells (#901)", () => {
  async function createArcaneTrickster(xp: number, edition: "EDITION_2014" | "EDITION_2024") {
    await createCaster(
      { className: "Rogue", classId: rogueClassId, subclassName: "Arcane Trickster", subclassId: arcaneTricksterId, savingThrowProficiencies: ["dexterity", "intelligence"] },
      xp,
      edition,
    );
  }

  it.each(["EDITION_2014", "EDITION_2024"] as const)(
    "a %s Arcane Trickster surfaces Mage Hand as an always-prepared subclass grant at level 3",
    async (edition) => {
      await createArcaneTrickster(XP_LVL_5, edition);
      const granted = await grantedSpells();
      expect(granted.map((s) => s.name)).toEqual(["Mage Hand"]);
      expect(granted[0].prepared).toBe(true);
      expect(granted[0].source).toBe("subclass");
    },
  );

  // Pins the exact L3 gate edge — the it.each above only proves survival well above it, which a wrong gateLevel would still pass.
  it("grants nothing at level 2, one level below the gate", async () => {
    await createArcaneTrickster(XP_LVL_2, "EDITION_2024");
    expect(await grantedSpells()).toEqual([]);
  });

  it("grants Mage Hand exactly at level 3, the gate itself", async () => {
    await createArcaneTrickster(XP_LVL_3, "EDITION_2024");
    expect((await grantedSpells()).map((s) => s.name)).toEqual(["Mage Hand"]);
  });
});

// Minor Illusion is renamed in 2024: Improved Minor Illusion (PHB'14 p.117, Wizard L2) -> Improved Illusions (PHB'24, wizard-features.ts ILLUSION_RAW, Wizard L3) — one shared Subclass row, forked on gateLevel only (#901).
describe("Illusion Wizard granted spells (#901)", () => {
  async function createIllusionWizard(xp: number, edition: "EDITION_2014" | "EDITION_2024", storedSpells: unknown[] = []) {
    await createCaster(
      { className: "Wizard", classId: wizardClassId, subclassName: "School of Illusion", subclassId: illusionId, savingThrowProficiencies: ["intelligence", "wisdom"] },
      xp,
      edition,
      storedSpells,
    );
  }

  // XP_LVL_2, not XP_LVL_5 — pins the actual L2 gate edge; well above it would not distinguish a wrong gateLevel of 3.
  it("a 2014 Illusion wizard has Minor Illusion granted at level 2", async () => {
    await createIllusionWizard(XP_LVL_2, "EDITION_2014");
    const granted = await grantedSpells();
    expect(granted.map((s) => s.name)).toEqual(["Minor Illusion"]);
  });

  it("a 2024 Illusionist does NOT have Minor Illusion at level 2", async () => {
    await createIllusionWizard(XP_LVL_2, "EDITION_2024");
    expect(await grantedSpells()).toEqual([]);
  });

  it("a 2024 Illusionist DOES have Minor Illusion at level 3", async () => {
    await createIllusionWizard(XP_LVL_3, "EDITION_2024");
    const granted = await grantedSpells();
    expect(granted.map((s) => s.name)).toEqual(["Minor Illusion"]);
  });

  it("a wizard who already knows Minor Illusion sees it exactly once — the granted copy is suppressed", async () => {
    const learnedMinorIllusion = {
      id: "learned-minor-illusion",
      name: "Minor Illusion",
      level: 0,
      school: "illusion",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "1 minute",
      description: "Create a sound or an image of an object within range.",
    };
    await createIllusionWizard(XP_LVL_5, "EDITION_2014", [learnedMinorIllusion]);
    const spells = await allSpells();
    const minorIllusions = spells.filter((s) => s.name === "Minor Illusion");
    expect(minorIllusions).toHaveLength(1);

    expect(minorIllusions[0].source).toBeUndefined();
  });

  it("the grant does not count against the prepared-spell cap", async () => {
    await createIllusionWizard(XP_LVL_5, "EDITION_2014");
    const { preparedSpellCount, spells } = await fullCharacter();
    const grant = spells.find((s) => s.name === "Minor Illusion");
    expect(grant?.source).toBe("subclass");
    // Level 0 means this only exercises derivePreparedFields' level>0 filter, not the separate source==null guard (indistinguishable for a cantrip).
    expect(preparedSpellCount).toBe(0);
  });
});
