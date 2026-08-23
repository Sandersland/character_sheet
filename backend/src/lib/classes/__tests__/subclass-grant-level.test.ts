// PHB'24: every class chooses its subclass at level 3 — isSubclassActive
// resolves through subclassActiveAt, which hardcodes 3 for EDITION_2024
// regardless of the class-definition grantLevel table (2014-scoped).
import { describe, it, expect } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

function subclassFeatures(className: string, subclass: string, level: number, edition: RulesEdition = "EDITION_2024") {
  const info = deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level), testFeatureRowsFor(className, subclass), edition);
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

// The Archfey and The Great Old One are excluded: they have zero
// EDITION_2024 rows (no licensed source to verify their PHB'24 rework), so
// there's no 2024 gate for them to have moved to. Their 2014 gate of 1 is
// asserted by GATE_1 below.
const MOVED: Array<[string, string]> = [
  ["cleric", "life domain"],
  ["cleric", "trickery domain"],
  ["sorcerer", "draconic bloodline"],
  ["sorcerer", "wild magic"],
  ["warlock", "the fiend"],
  ["wizard", "school of evocation"],
  ["wizard", "school of abjuration"],
  ["wizard", "school of illusion"],
  ["druid", "circle of the land"],
  ["druid", "circle of the moon"],
];

describe("subclass grant level is 3 for all classes (#1128)", () => {
  it.each(MOVED)("%s / %s contributes no subclass features at level 2", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 2)).toEqual([]);
  });

  it.each(MOVED)("%s / %s contributes subclass features at level 3", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 3).length).toBeGreaterThan(0);
  });

  // The only check in this suite that the gate suppresses `.resources` pools,
  // not just `.features`. Wild Magic opens at level 1 under 2014 (PHB'14
  // p.99) and level 3 under 2024, where the Tides of Chaos row sits (PHB'24 p.149).
  it("Wild Magic's tidesOfChaos pool tracks the subclass gate, which differs by edition", () => {
    const at = (level: number, edition: RulesEdition) =>
      deriveResources("sorcerer", "wild magic", level, ABILITIES, proficiencyBonusForLevel(level), testFeatureRowsFor("sorcerer", "wild magic"), edition)
        ?.resources.some((r) => r.key === "tidesOfChaos") ?? false;
    expect(at(1, "EDITION_2014")).toBe(true);
    expect(at(2, "EDITION_2014")).toBe(true);
    expect(at(1, "EDITION_2024")).toBe(false);
    expect(at(2, "EDITION_2024")).toBe(false);
    expect(at(3, "EDITION_2024")).toBe(true);
  });

  // The lowest domain/patron spell tier grants at level 3 in 2024, so no
  // feature description may still label it "(L1)". The Archfey/The Great Old
  // One are excluded — zero EDITION_2024 rows to inspect.
  const L1_LABEL_SUBCLASSES: Array<[string, string]> = [
    ["cleric", "life domain"],
    ["cleric", "trickery domain"],
    ["warlock", "the fiend"],
  ];
  it.each(L1_LABEL_SUBCLASSES)("%s / %s has no feature description labelling a tier (L1)", (className, subclass) => {
    const info = deriveResources(className, subclass, 20, ABILITIES, proficiencyBonusForLevel(20), testFeatureRowsFor(className, subclass), "EDITION_2024");
    const withL1 = (info?.features ?? []).filter((f) => f.description.includes("(L1)")).map((f) => f.name);
    expect(withL1).toEqual([]);
  });
});

// PHB'14: Cleric/Sorcerer/Warlock open at 1, Druid/Wizard at 2 — the opposite
// of the 2024 table above. Pins deriveResources agreeing with
// buildClassesView's per-class gate. This describe block pins the GATE VALUE,
// not which mechanism produces it (a TS module's grantLevel vs. the seeded
// subclassLevel) — that distinction is covered by the seeded-vs-module gate-source suite.
describe("subclass grant level is edition-aware for 2014 (#1291) — full twelve", () => {
  const GATE_1: Array<[string, string]> = [
    ["cleric", "life domain"],
    ["cleric", "trickery domain"],
    ["sorcerer", "draconic bloodline"],
    ["sorcerer", "wild magic"],
    ["warlock", "the archfey"],
    ["warlock", "the fiend"],
    ["warlock", "the great old one"],
  ];
  it.each(GATE_1)("%s / %s contributes subclass features at level 1 under 2014", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 1, "EDITION_2014").length).toBeGreaterThan(0);
  });

  const GATE_2: Array<[string, string]> = [
    ["druid", "circle of the land"],
    ["druid", "circle of the moon"],
    ["wizard", "school of evocation"],
    ["wizard", "school of abjuration"],
    ["wizard", "school of illusion"],
  ];
  it.each(GATE_2)("%s / %s contributes no subclass features at level 1 but does at level 2 under 2014", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 1, "EDITION_2014")).toEqual([]);
    expect(subclassFeatures(className, subclass, 2, "EDITION_2014").length).toBeGreaterThan(0);
  });

  it("the SAME subclass/level disagrees in 2024 vs. 2014 (Cleric at level 1)", () => {
    expect(subclassFeatures("cleric", "life domain", 1, "EDITION_2024")).toEqual([]);
    expect(subclassFeatures("cleric", "life domain", 1, "EDITION_2014").length).toBeGreaterThan(0);
  });
});
