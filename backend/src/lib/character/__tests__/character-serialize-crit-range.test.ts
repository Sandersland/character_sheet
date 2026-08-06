// #1120: serializeCharacter emits `critRange` — derived at read time from the
// REAL seeded Champion "Improved Critical"/"Superior Critical" rows, never a
// persisted column. Mirrors character-serialize-riders.test.ts's pattern:
// points at the real seeded Fighter class + Champion subclass (read-only,
// never mutated) rather than a bespoke Subclass row, since this suite has no
// other reason to own its own class.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-serialize-crit-range";
const CHAR_IDS = [
  "crit-range-champion-l2",
  "crit-range-champion-l3",
  "crit-range-champion-l14",
  "crit-range-champion-l15",
  "crit-range-non-champion-l20",
  "crit-range-champion-2014-l15",
];

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

const BASE = {
  ownerId: OWNER_ID,
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [] as string[],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
};

let fighterClassId: string;
let championSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
  championSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterClassId, name: "Champion" } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

function championCharacter(id: string, level: number, hitDice = { total: level, die: "d10" as const, spent: 0 }) {
  return prisma.character.create({
    data: {
      ...BASE,
      id,
      name: `Crit Range Fixture (${id})`,
      experiencePoints: 0, // level/proficiency derive off classEntries[0].level for this suite's purposes, not experiencePoints
      hitDice,
      classEntries: {
        create: [
          {
            name: "fighter",
            position: 0,
            level,
            subclass: "champion",
            classId: fighterClassId,
            subclassId: championSubclassId,
          },
        ],
      },
    },
  });
}

describe("serializeCharacter critRange (#1120) — real seeded Champion rows, EDITION_2024 default", () => {
  it("a level-2 Champion (below the L3 grant) stays at the default 20", async () => {
    await championCharacter("crit-range-champion-l2", 2);
    expect((await serialize("crit-range-champion-l2")).critRange).toBe(20);
  });

  it("a level-3 Champion crits on 19 or 20", async () => {
    await championCharacter("crit-range-champion-l3", 3);
    expect((await serialize("crit-range-champion-l3")).critRange).toBe(19);
  });

  it("a level-14 Champion (below the Superior Critical L15 grant) still crits on 19-20", async () => {
    await championCharacter("crit-range-champion-l14", 14);
    expect((await serialize("crit-range-champion-l14")).critRange).toBe(19);
  });

  it("a level-15 Champion crits on 18-20", async () => {
    await championCharacter("crit-range-champion-l15", 15);
    expect((await serialize("crit-range-champion-l15")).critRange).toBe(18);
  });

  it("a non-Champion fighter at L20 stays at the default 20", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "crit-range-non-champion-l20",
        name: "Crit Range Fixture (non-champion)",
        experiencePoints: 0,
        hitDice: { total: 20, die: "d10", spent: 0 },
        classEntries: { create: [{ name: "fighter", position: 0, level: 20, classId: fighterClassId }] },
      },
    });
    expect((await serialize("crit-range-non-champion-l20")).critRange).toBe(20);
  });
});

// Edition-invariant proof (#1120 AC): the SAME level/threshold pairing holds
// for a 2014 character as the EDITION_2024 default suite above already
// pinned at L15 -> 18 — mutating deriveCritRange to fork on `edition` would
// leave this fixture's 2024 sibling (crit-range-champion-l15) disagreeing
// with this one at the identical level.
describe("serializeCharacter critRange (#1120) — 2014 Champion agrees with 2024 at the same level", () => {
  it("a 2014 level-15 Champion also crits on 18-20", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "crit-range-champion-2014-l15",
        name: "Crit Range Fixture (2014)",
        rulesEdition: "EDITION_2014",
        experiencePoints: 0,
        hitDice: { total: 15, die: "d10", spent: 0 },
        classEntries: {
          create: [{ name: "fighter", position: 0, level: 15, subclass: "champion", classId: fighterClassId, subclassId: championSubclassId }],
        },
      },
    });
    expect((await serialize("crit-range-champion-2014-l15")).critRange).toBe(18);
  });
});
