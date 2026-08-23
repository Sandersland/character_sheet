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

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

function subclassFeatures(className: string, subclass: string, level: number, edition: RulesEdition = "EDITION_2024") {
  const info = deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level), testFeatureRowsFor(className, subclass), edition);
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

// Ten of the twelve non-3 `grantLevel` subclasses (#1546 Part A's verified
// list) whose 2014 gate moved to 3 under 2024 — everything else the list names,
// not a representative sample, since Part A's registration change touches every
// class's subclass lookup and this is the surface it must leave unchanged.
// The Archfey and The Great Old One are the two exclusions (#1595): #1233
// authored them zero EDITION_2024 rows (no licensed source could verify their
// PHB'24 reworks), so there is no 2024 gate for them to have moved to and
// assertEverySubclassEditionPopulated stops a 2024 character picking either.
// Their 2014 gate of 1 is asserted by GATE_1 below.
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

  // The only place in the repo asserting the gate suppresses `.resources` pools
  // and not just `.features`. Wild Magic carries it since #1595 retired the
  // Archfey pool case (that patron has no EDITION_2024 rows to gate at all);
  // it is the same "gate moved" shape — Wild Magic opens at level 1 under 2014
  // (PHB'14 p. 99) and at 3 under 2024, where the `Tides of Chaos` row itself
  // sits (PHB'24 p. 149). Written as an edition CONTRAST on one pool key rather
  // than the 2024 half alone: no real PHB'24 subclass row exists below level 3,
  // so the 2024 half cannot on its own separate the subclass gate from the
  // row's own level gate, and asserting it that way would read as a stronger
  // claim than the data supports.
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

  // The lowest domain/patron spell tier now grants at level 3, so no cleric or
  // warlock subclass feature description may still label it "(L1)" (#1128).
  // Intrinsically a 2024-only rule, so The Archfey/The Great Old One are out
  // (#1595): with zero EDITION_2024 rows the filter inspects nothing and the
  // case passes vacuously, while their 2014 text legitimately writes SPELL
  // levels as "(1st)"/"(2nd)".
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

// #1291: under EDITION_2014, isSubclassActive resolves grantLevel through the
// SAME subclassActiveAt gate buildClassesView uses — Cleric/Sorcerer/Warlock
// open at 1, Druid/Wizard at 2 (PHB'14), the opposite of the 2024 table above.
// Pins deriveResources agreeing with buildClassesView's per-class gate (the
// live bug: they used to disagree the moment #1308 seeded real 2014 values).
// #1546 Part A: the full twelve non-3 `grantLevel` subclasses (the arbiter's
// verified list — everything else gates at 3, including all three Fighter
// subclasses via their identity-only SUBCLASS_IDENTITY entry, #1546). Part A's
// registration change is behaviour-preserving by construction, so these
// twelve stay exactly as gated as before — this is the exhaustive version of
// the GATE_1/GATE_2 spot-checks below, closing the gap between "5
// representative subclasses" and "all twelve the issue names".
//
// #1576 later deleted eight of these twelve's TS modules outright (Cleric's
// two, Warlock's three, Wizard's three) — testFeatureRowsFor's own
// SUBCLASS_LEVEL_BY_CLASS map now supplies the seeded gate for every one of
// these twelve, module or not, which is why the assertions below stay green
// through that data-source switch: this describe block pins the GATE VALUE
// (1 or 2), not which mechanism (a TS module's `grantLevel` vs. the seeded
// `subclassLevel`) produces it — that distinction, and the one place the TS
// `?? def.grantLevel` fallback is still exercised (Sorcerer/Druid, the four
// of these twelve whose module survives), is subclass-gate-data-source.test.ts's
// job.
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
