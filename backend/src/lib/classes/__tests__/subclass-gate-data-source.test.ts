// The 2014 subclass grant level has a data source that survives its class
// module's deletion — the seeded CharacterClass.subclassLevel, carried to
// isSubclassActive on ClassFeatureRowsCarrier. Before this, grantLevel on a
// lib/classes/<class>.ts SubclassDefinition was the only runtime source,
// while buildClassesView, character creation and the level-up ceremony all
// read the seeded column, so deleting a module moved the gate to 3 and split
// a character's subclass NAME (seeded column) from its FEATURES (module
// gone). This file's own STILL_ON_TS_PATH cases are the only place left that exercises the `?? def.grantLevel` fallback.
import { describe, expect, it } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources } from "@/lib/classes/class-features.js";
import { prisma } from "@/lib/core/prisma.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { SUBCLASS_LEVEL_BY_CLASS, testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

// Literal page-cited values, NOT read from the same constant the
// implementation reads (a src file can't import anything under prisma/,
// TS6059) — the DB assertion below ties these literals to the real seed.
const PHB14_GATE: Array<[string, string, number]> = [
  ["cleric", "life domain", 1], // PHB'14 p.57
  ["sorcerer", "draconic bloodline", 1], // PHB'14 p.99
  ["warlock", "the fiend", 1], // PHB'14 p.105
  ["druid", "circle of the land", 2], // PHB'14 p.66
  ["wizard", "school of evocation", 2], // PHB'14 p.114
];

// Cleric/Warlock/Wizard/Sorcerer's modules are deleted outright; Druid's
// stays for an independent reason its own file header names.
// Split ONLY for the "no seeded value" fallback test below — every other
// test in this file behaves identically whether the module exists or not.
const STILL_ON_TS_PATH: Array<[string, string, number]> = [
  ["druid", "circle of the land", 2],
];
const MODULE_DELETED: Array<[string, string, number]> = [
  ["cleric", "life domain", 1],
  ["sorcerer", "draconic bloodline", 1],
  ["warlock", "the fiend", 1],
  ["wizard", "school of evocation", 2],
];

// Derives a subclass's features with the carrier's subclassLevel set
// explicitly — the shape a real caller gets from featureRowsOf once its
// select carries the class relation. Passing undefined reproduces a
// narrow-select caller, which is the fallback path.
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

  // For Druid (module still present) the carrier's seeded value must beat
  // whatever the module's own grantLevel would otherwise supply.
  it.each(STILL_ON_TS_PATH)(
    "%s / %s: the seeded value WINS over the module's own grantLevel",
    (className, subclass, gate) => {
      // Seeded 3 beats a module that says 1 or 2 -> nothing at the module's gate.
      expect(subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", 3)).toEqual([]);
      // ...and the features return at 3, proving it was the gate that moved and
      // not the rows disappearing.
      expect(subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2014", 3).length).toBeGreaterThan(0);
    },
  );

  // Cleric/Warlock/Wizard/Sorcerer have no module left at all, so there's nothing left to "win" against.
  it.each(MODULE_DELETED)(
    "%s / %s: the seeded value alone decides the gate (no module left to beat)",
    (className, subclass, gate) => {
      expect(subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", 3)).toEqual([]);
      expect(subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2014", 3).length).toBeGreaterThan(0);
    },
  );

  // Goes red if someone "simplifies" the `?? def.grantLevel` fallback away
  // while Druid's module still exists.
  it.each(STILL_ON_TS_PATH)(
    "%s / %s: with no seeded value the module still decides (unchanged fallback)",
    (className, subclass, gate) => {
      expect(
        subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", undefined).length,
      ).toBeGreaterThan(0);
    },
  );

  // Cleric/Warlock/Wizard/Sorcerer's modules are gone, so a narrow-select caller has
  // no def.grantLevel left to fall back to and now gates at
  // subclassGateLevel's plain ?? 3 default instead of the class's own PHB'14
  // gate — a narrow-select-only consequence, since every production caller
  // already carries the seeded relation.
  it.each(MODULE_DELETED)(
    "%s / %s: with no seeded value and no module left, the gate falls back to subclassGateLevel's plain 3",
    (className, subclass, gate) => {
      expect(subclassFeaturesWithSeededGate(className, subclass, gate, "EDITION_2014", undefined)).toEqual([]);
      expect(
        subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2014", undefined).length,
      ).toBeGreaterThan(0);
    },
  );

  // 2024 is unaffected in both directions: subclassGateLevel hardcodes 3 there
  // and ignores the column outright, so a seeded 1 must NOT open the gate early.
  it.each(PHB14_GATE)("%s / %s: EDITION_2024 stays gated at 3 regardless of the seeded value", (className, subclass) => {
    expect(subclassFeaturesWithSeededGate(className, subclass, 1, "EDITION_2024", 1)).toEqual([]);
    expect(subclassFeaturesWithSeededGate(className, subclass, 2, "EDITION_2024", 1)).toEqual([]);
    expect(subclassFeaturesWithSeededGate(className, subclass, 3, "EDITION_2024", 1).length).toBeGreaterThan(0);
  });
});

describe("the seeded column actually holds the PHB'14 values (#1576)", () => {
  // Ties the literals above to the real catalog. Without this they would be
  // self-referential — the gate tests would pass against any number as long as
  // the same number were used on both sides.
  it.each(PHB14_GATE)("%s's seeded CharacterClass.subclassLevel is its PHB'14 gate", async (className, _sub, gate) => {
    const row = await prisma.characterClass.findFirstOrThrow({
      where: { name: className.charAt(0).toUpperCase() + className.slice(1) },
      select: { name: true, subclassLevel: true },
    });
    expect(row.subclassLevel, row.name).toBe(gate);
  });

  // Anti-vacuity: every other class must gate at 3, so the five above are a
  // real minority rather than the whole table trivially matching.
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
