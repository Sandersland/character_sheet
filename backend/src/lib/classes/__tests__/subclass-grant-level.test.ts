// 2024 rules: every class chooses its subclass at level 3 (#1128) — no subclass
// feature or pool derives below level 3 under EDITION_2024, regardless of the
// class-definition grantLevel table's (2014-scoped, #1291) content: isSubclassActive
// resolves through subclassActiveAt, which hardcodes 3 for 2024. The cross-source
// invariant that grantLevel matches the seed catalog's 2014 value lives with the
// seed structural checks (seed-data.test.ts), which can import the seed catalog.
import { describe, it, expect } from "vitest";

import type { RulesEdition } from "@character-sheet/shared-types";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

function subclassFeatures(className: string, subclass: string, level: number, edition: RulesEdition = "EDITION_2024") {
  const info = deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level), edition);
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

// One representative subclass per class whose subclass grant moved to 3.
const MOVED: Array<[string, string]> = [
  ["cleric", "life domain"],
  ["sorcerer", "draconic bloodline"],
  ["warlock", "the archfey"],
  ["wizard", "school of evocation"],
  ["druid", "circle of the moon"],
];

describe("subclass grant level is 3 for all classes (#1128)", () => {
  it.each(MOVED)("%s / %s contributes no subclass features at level 2", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 2)).toEqual([]);
  });

  it.each(MOVED)("%s / %s contributes subclass features at level 3", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 3).length).toBeGreaterThan(0);
  });

  it("Archfey's feyPresence pool is absent at level 2 and present at level 3", () => {
    const at = (level: number) =>
      deriveResources("warlock", "the archfey", level, ABILITIES, proficiencyBonusForLevel(level), "EDITION_2024")
        ?.resources.some((r) => r.key === "feyPresence") ?? false;
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });

  // The lowest domain/patron spell tier now grants at level 3, so no cleric or
  // warlock subclass feature description may still label it "(L1)" (#1128).
  const L1_LABEL_SUBCLASSES: Array<[string, string]> = [
    ["cleric", "life domain"],
    ["cleric", "trickery domain"],
    ["warlock", "the fiend"],
    ["warlock", "the archfey"],
    ["warlock", "the great old one"],
  ];
  it.each(L1_LABEL_SUBCLASSES)("%s / %s has no feature description labelling a tier (L1)", (className, subclass) => {
    const info = deriveResources(className, subclass, 20, ABILITIES, proficiencyBonusForLevel(20), "EDITION_2024");
    const withL1 = (info?.features ?? []).filter((f) => f.description.includes("(L1)")).map((f) => f.name);
    expect(withL1).toEqual([]);
  });
});

// #1291: under EDITION_2014, isSubclassActive resolves grantLevel through the
// SAME subclassActiveAt gate buildClassesView uses — Cleric/Sorcerer/Warlock
// open at 1, Druid/Wizard at 2 (PHB'14), the opposite of the 2024 table above.
// Pins deriveResources agreeing with buildClassesView's per-class gate (the
// live bug: they used to disagree the moment #1308 seeded real 2014 values).
describe("subclass grant level is edition-aware for 2014 (#1291)", () => {
  const GATE_1: Array<[string, string]> = [
    ["cleric", "life domain"],
    ["sorcerer", "draconic bloodline"],
    ["warlock", "the archfey"],
  ];
  it.each(GATE_1)("%s / %s contributes subclass features at level 1 under 2014", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 1, "EDITION_2014").length).toBeGreaterThan(0);
  });

  const GATE_2: Array<[string, string]> = [
    ["druid", "circle of the moon"],
    ["wizard", "school of evocation"],
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
