// The seeded CharacterClass.subclassLevel is the 2014 subclass-gate source
// that survives a class module's deletion. Every class this file tests is
// now module-deleted — Ranger and Monk, the only classes still on the TS
// path, already grant at level 3 (subclassGateLevel's own default) — so
// nothing here exercises the `?? def.grantLevel` fallback any more; that
// fallback has no live test seat until a future TS class's grantLevel
// differs from 3.
import { describe, expect, it } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources } from "@/lib/classes/class-features.js";
import { prisma } from "@/lib/core/prisma.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { SUBCLASS_LEVEL_BY_CLASS, testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

// Literal page-cited values, not imported from the seed (a src file can't
// import anything under prisma/, TS6059) — the DB suite below ties them to
// the real rows so they can't drift self-referentially.
const PHB14_GATE: Array<[string, string, number]> = [
  ["cleric", "life domain", 1], // PHB'14 p.57
  ["sorcerer", "draconic bloodline", 1], // PHB'14 p.99
  ["warlock", "the fiend", 1], // PHB'14 p.105
  ["druid", "circle of the land", 2], // PHB'14 p.66
  ["wizard", "school of evocation", 2], // PHB'14 p.114
];

const MODULE_DELETED: Array<[string, string, number]> = [
  ["cleric", "life domain", 1],
  ["sorcerer", "draconic bloodline", 1],
  ["warlock", "the fiend", 1],
  ["druid", "circle of the land", 2],
  ["wizard", "school of evocation", 2],
];

// subclassLevel: undefined reproduces a narrow-select caller (the fallback path).
function subclassFeaturesWithSeededGate(
  className: string,
  subclass: string,
  level: number,
  edition: RulesEdition,
  subclassLevel: number | undefined,
) {
  const rows = testFeatureRowsFor(className, subclass);
  const info = deriveResources(
    className,
    subclass,
    level,
    ABILITIES,
    proficiencyBonusForLevel(level),
    { ...rows, subclassLevel },
    edition,
  );
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

describe("2014 subclass gate reads the seeded subclassLevel (#1576)", () => {
  it.each(PHB14_GATE)(
    "%s / %s: no subclass features below its PHB'14 gate, features at it",
    (className, subclass, gate) => {
      if (gate > 1) {
        expect(subclassFeaturesWithSeededGate(className, subclass, gate - 1, "EDITION_2014", gate)).toEqual([]);
      }
      expect(
        subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", gate).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(MODULE_DELETED)(
    "%s / %s: the seeded value alone decides the gate (no module left to beat)",
    (className, subclass, gate) => {
      expect(subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", 3)).toEqual([]);
      expect(subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2014", 3).length).toBeGreaterThan(0);
    },
  );

  // Narrow-select-only consequence: every production caller already carries the seeded relation.
  it.each(MODULE_DELETED)(
    "%s / %s: with no seeded value and no module left, the gate falls back to subclassGateLevel's plain 3",
    (className, subclass, gate) => {
      expect(subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", undefined)).toEqual([]);
      expect(
        subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2014", undefined).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(PHB14_GATE)("%s / %s: EDITION_2024 stays gated at 3 regardless of the seeded value", (className, subclass) => {
    expect(subclassFeaturesWithSeededGate(className, subclass, 1, "EDITION_2024", 1)).toEqual([]);
    expect(subclassFeaturesWithSeededGate(className, subclass, 2, "EDITION_2024", 1)).toEqual([]);
    expect(subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2024", 1).length).toBeGreaterThan(0);
  });
});

describe("the seeded column actually holds the PHB'14 values (#1576)", () => {
  // Without this, PHB14_GATE would pass against any number used on both sides.
  it.each(PHB14_GATE)("%s's seeded CharacterClass.subclassLevel is its PHB'14 gate", async (className, _sub, gate) => {
    const row = await prisma.characterClass.findFirstOrThrow({
      where: { name: className.charAt(0).toUpperCase() + className.slice(1) },
      select: { name: true, subclassLevel: true },
    });
    expect(row.subclassLevel, row.name).toBe(gate);
  });

  // Anti-vacuity: the five above must be a real minority, not the whole table trivially matching.
  it("exactly five classes carry a non-3 subclassLevel", async () => {
    const rows = await prisma.characterClass.findMany({ select: { name: true, subclassLevel: true } });
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const nonThree = rows.filter((r) => r.subclassLevel !== 3).map((r) => `${r.name}=${r.subclassLevel}`).sort();
    expect(nonThree).toEqual(["Cleric=1", "Druid=2", "Sorcerer=1", "Warlock=1", "Wizard=2"]);
  });

  it("SUBCLASS_LEVEL_BY_CLASS mirrors every seeded CharacterClass.subclassLevel", async () => {
    const rows = await prisma.characterClass.findMany({ select: { name: true, subclassLevel: true } });
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const row of rows) {
      expect(SUBCLASS_LEVEL_BY_CLASS[row.name.toLowerCase()] ?? 3, row.name).toBe(row.subclassLevel);
    }
  });
});
