import { describe, it, expect } from "vitest";

import {
  eligibleNewCantrips,
  eligibleNewSpells,
  offListSelectedCount,
  readNewSpellsMeta,
  selectedSpellIds,
  spellListsLabel,
  spellSchoolEligible,
  swappableKnownSpells,
  toggleForgetSpell,
  toggleLearnSpell,
} from "@/lib/newSpells";
import type { CatalogSpell, LearnSpellOperation, LevelUpStep, Spell } from "@/types/character";

function spell(id: string, level: number, classes: string[]): CatalogSpell {
  return {
    id, name: id, level, school: "evocation", castingTime: "1 action",
    range: "60 ft", duration: "Instant", description: "", concentration: false,
    ritual: false, classes, cantripScaling: false,
  };
}

const CATALOG: CatalogSpell[] = [
  spell("firebolt", 0, ["wizard", "sorcerer"]),
  spell("shield", 1, ["wizard", "sorcerer"]),
  spell("mistyStep", 2, ["wizard", "sorcerer"]),
  spell("fireball", 3, ["wizard", "sorcerer"]),
  spell("cureWounds", 1, ["bard", "cleric"]),
  spell("chaosBolt", 1, ["sorcerer"]),
  spell("huntersMark", 1, ["ranger"]),
];

describe("readNewSpellsMeta", () => {
  it("reads count, ceiling, the secrets flag, and the served lists", () => {
    const step: LevelUpStep = {
      kind: "newSpells",
      count: 2,
      meta: { maxSpellLevel: 5, magicalSecrets: true, spellLists: ["bard", "wizard"], cantripLists: ["bard"] },
    };
    expect(readNewSpellsMeta(step)).toEqual({
      count: 2, maxSpellLevel: 5, magicalSecrets: true, canSwap: false, cantrips: 0,
      spellLists: ["bard", "wizard"], cantripLists: ["bard"], casterModel: null, expandedSpellIds: [],
      spellSchools: null, freeSchoolPicks: 0,
    });
  });

  it("defaults ceiling to 0, secrets to false, and lists to null when meta is absent", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1 };
    expect(readNewSpellsMeta(step)).toEqual({
      count: 1, maxSpellLevel: 0, magicalSecrets: false, canSwap: false, cantrips: 0,
      spellLists: null, cantripLists: null, casterModel: null, expandedSpellIds: [],
      spellSchools: null, freeSchoolPicks: 0,
    });
  });

  // spellLists is class-membership; spellSchools is a separate wizard-list SCHOOL restriction (Eldritch Knight, 2014).
  it("reads spellSchools/freeSchoolPicks from meta (#1855)", () => {
    const step: LevelUpStep = {
      kind: "newSpells",
      count: 3,
      meta: { spellSchools: ["abjuration", "evocation"], freeSchoolPicks: 1 },
    };
    expect(readNewSpellsMeta(step).spellSchools).toEqual(["abjuration", "evocation"]);
    expect(readNewSpellsMeta(step).freeSchoolPicks).toBe(1);
  });

  it("reads expandedSpellIds from meta (#1631)", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1, meta: { expandedSpellIds: ["burning-hands-id"] } };
    expect(readNewSpellsMeta(step).expandedSpellIds).toEqual(["burning-hands-id"]);
  });

  it("reads canSwap from meta (#1101)", () => {
    expect(readNewSpellsMeta({ kind: "newSpells", count: 0, meta: { canSwap: true } }).canSwap).toBe(true);
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1 }).canSwap).toBe(false);
  });

  it("reads cantrips from meta (#1131)", () => {
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1, meta: { cantrips: 1 } }).cantrips).toBe(1);
    expect(readNewSpellsMeta({ kind: "newSpells", count: 0 }).cantrips).toBe(0);
  });

  it("reads spellLists/cantripLists as explicitly null when the server served null (#1440)", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1, meta: { spellLists: null, cantripLists: null } };
    expect(readNewSpellsMeta(step).spellLists).toBeNull();
    expect(readNewSpellsMeta(step).cantripLists).toBeNull();
  });

  it("reads casterModel from meta — known/prepared/absent-defaults-to-null (#1509)", () => {
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1, meta: { casterModel: "known" } }).casterModel).toBe("known");
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1, meta: { casterModel: "prepared" } }).casterModel).toBe("prepared");
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1 }).casterModel).toBeNull();
  });
});

describe("eligibleNewCantrips (#1440: takes cantripLists, not className)", () => {
  it("keeps only the served list's cantrips (level 0)", () => {
    expect(eligibleNewCantrips(CATALOG, { cantripLists: ["wizard"] }).map((s) => s.id)).toEqual(["firebolt"]);
  });

  it("admits a cantrip on ANY of several served lists, and excludes leveled spells", () => {
    expect(eligibleNewCantrips(CATALOG, { cantripLists: ["sorcerer"] }).map((s) => s.id)).toEqual(["firebolt"]);
  });

  it("cantripLists === null (PHB'14 Bard) offers a wizard-only cantrip", () => {
    expect(eligibleNewCantrips(CATALOG, { cantripLists: null }).map((s) => s.id)).toEqual(["firebolt"]);
  });

  it("cantripLists ['bard'] excludes a wizard-only cantrip", () => {
    expect(eligibleNewCantrips(CATALOG, { cantripLists: ["bard"] }).map((s) => s.id)).toEqual([]);
  });

  it("returns [] for a null catalog", () => {
    expect(eligibleNewCantrips(null, { cantripLists: ["wizard"] })).toEqual([]);
  });
});

describe("spellListsLabel (#1440)", () => {
  it("renders the four 2024 Magical Secrets lists with an Oxford 'or'", () => {
    expect(spellListsLabel(["bard", "cleric", "druid", "wizard"])).toBe("Bard, Cleric, Druid, or Wizard");
  });

  it("renders a single list as just the capitalized class name", () => {
    expect(spellListsLabel(["wizard"])).toBe("Wizard");
  });

  it("renders two lists joined by 'or', no comma", () => {
    expect(spellListsLabel(["bard", "wizard"])).toBe("Bard or Wizard");
  });

  it("renders null as the PHB'14 unrestricted phrase", () => {
    expect(spellListsLabel(null)).toBe("any class's");
  });

  // Not reachable via spellListsFor today (always returns ≥ [key]) — a defensive guard for a future caller passing [].
  it("renders an empty list as an empty string, not ', or undefined'", () => {
    expect(spellListsLabel([])).toBe("");
  });
});

describe("swappableKnownSpells (#1101)", () => {
  function known(id: string, level: number, source?: "subclass" | "item"): Spell {
    return {
      id, name: id, level, school: "evocation", castingTime: "1 action",
      range: "60 ft", duration: "Instant", description: "", prepared: false, source,
    };
  }

  it("keeps user-learned leveled spells, dropping cantrips and granted/item spells", () => {
    const spells: Spell[] = [
      known("firebolt", 0),
      known("shield", 1),
      known("mistyStep", 2),
      known("hex", 1, "subclass"),
      known("faerieFire", 1, "item"),
    ];
    expect(swappableKnownSpells(spells).map((s) => s.id)).toEqual(["shield", "mistyStep"]);
  });

  it("tolerates an empty list", () => {
    expect(swappableKnownSpells([])).toEqual([]);
  });
});

describe("toggleForgetSpell (#1101)", () => {
  const learn = (id: string): LearnSpellOperation => ({ type: "learnSpell", spellId: id });

  it("selects a forget when none is set (learns untouched)", () => {
    const out = toggleForgetSpell({ spellsLearned: [learn("s1")] }, "e1", 1);
    expect(out.spellsForgotten).toEqual([{ type: "forgetSpell", entryId: "e1" }]);
    expect(out.spellsLearned).toEqual([learn("s1")]);
  });

  it("replaces a prior forget with a different one", () => {
    const out = toggleForgetSpell({ spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }] }, "e2", 1);
    expect(out.spellsForgotten).toEqual([{ type: "forgetSpell", entryId: "e2" }]);
  });

  it("deselects when toggling the same entry, trimming the over-cap extra learn", () => {
    const out = toggleForgetSpell(
      { spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }], spellsLearned: [learn("s1"), learn("s2")] },
      "e1",
      1,
    );
    expect(out.spellsForgotten).toEqual([]);
    expect(out.spellsLearned).toEqual([learn("s1")]);
  });
});

describe("eligibleNewSpells (#1440: takes the served spellLists, not className/magicalSecrets)", () => {
  it("keeps spells of level 1..ceiling on the served list, dropping cantrips and above-ceiling", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 2, spellLists: ["wizard"] });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep"]);
  });

  it("admits a spell on ANY of several served lists (the 2024 Magical Secrets case), still level-gated", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 2, spellLists: ["bard", "cleric", "druid", "wizard"] });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep", "cureWounds"]);
  });

  it("spellLists === null (PHB'14 unrestricted Bard) admits a ranger-only spell, still level-gated", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 2, spellLists: null });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep", "cureWounds", "chaosBolt", "huntersMark"]);
  });

  it("handles a null catalog", () => {
    expect(eligibleNewSpells(null, { maxSpellLevel: 2, spellLists: ["wizard"] })).toEqual([]);
  });

  it("admits an off-list spell whose id is in the served expandedSpellIds (#1631)", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 2, spellLists: ["wizard"], expandedSpellIds: ["chaosBolt"] });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep", "chaosBolt"]);
  });

  it("expandedSpellIds never bypasses the level ceiling", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 1, spellLists: ["wizard"], expandedSpellIds: ["fireball"] });
    expect(eligible.map((s) => s.id)).not.toContain("fireball");
  });

  it("omitted expandedSpellIds behaves exactly as before (#1440 regression guard)", () => {
    const eligible = eligibleNewSpells(CATALOG, { maxSpellLevel: 2, spellLists: ["wizard"] });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep"]);
  });
});

// Display filter only — assertSpellSchoolEligibility (backend) is the real enforcement of spellSchools/freeSchoolPicks.
describe("spellSchoolEligible (#1855)", () => {
  it("unrestricted (spellSchools null) always admits, regardless of school or free picks", () => {
    expect(spellSchoolEligible({ school: "necromancy" }, null, 0, 0)).toBe(true);
  });

  it("admits a spell whose school is on the restricted list, free picks or not", () => {
    expect(spellSchoolEligible({ school: "abjuration" }, ["abjuration", "evocation"], 0, 0)).toBe(true);
  });

  it("rejects an off-list school once the free-pick budget is exhausted", () => {
    expect(spellSchoolEligible({ school: "illusion" }, ["abjuration", "evocation"], 1, 1)).toBe(false);
  });

  it("admits an off-list school while a free pick still remains", () => {
    expect(spellSchoolEligible({ school: "illusion" }, ["abjuration", "evocation"], 1, 0)).toBe(true);
  });
});

describe("offListSelectedCount (#1855)", () => {
  const SCHOOL_CATALOG: CatalogSpell[] = [
    spell("mageArmor", 1, ["wizard"]),
    { ...spell("detectMagic", 1, ["wizard"]), school: "divination" },
    { ...spell("charmPerson", 1, ["wizard"]), school: "enchantment" },
  ];

  it("counts only the selected ids whose school is off the restricted list", () => {
    expect(offListSelectedCount(["mageArmor", "detectMagic", "charmPerson"], SCHOOL_CATALOG, ["abjuration", "evocation"])).toBe(2);
  });

  it("is 0 when spellSchools is unrestricted (null)", () => {
    expect(offListSelectedCount(["detectMagic", "charmPerson"], SCHOOL_CATALOG, null)).toBe(0);
  });

  it("is 0 for a null catalog (still loading)", () => {
    expect(offListSelectedCount(["detectMagic"], null, ["abjuration", "evocation"])).toBe(0);
  });
});

describe("toggleLearnSpell", () => {
  it("adds a learnSpell op when under the cap", () => {
    expect(toggleLearnSpell([], "shield", 2)).toEqual([{ type: "learnSpell", spellId: "shield" }]);
  });

  it("removes an already-selected spell", () => {
    const current: LearnSpellOperation[] = [{ type: "learnSpell", spellId: "shield" }];
    expect(toggleLearnSpell(current, "shield", 2)).toEqual([]);
  });

  it("refuses to add past the cap", () => {
    const current: LearnSpellOperation[] = [
      { type: "learnSpell", spellId: "shield" },
      { type: "learnSpell", spellId: "mistyStep" },
    ];
    expect(toggleLearnSpell(current, "fireball", 2)).toBe(current);
  });
});

describe("selectedSpellIds", () => {
  it("extracts catalog spellIds, tolerating undefined", () => {
    expect(selectedSpellIds(undefined)).toEqual([]);
    expect(
      selectedSpellIds([{ type: "learnSpell", spellId: "shield" }, { type: "learnSpell", spellId: "mistyStep" }]),
    ).toEqual(["shield", "mistyStep"]);
  });
});
