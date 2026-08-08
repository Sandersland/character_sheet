import { describe, it, expect } from "vitest";

// 2024 rules (SRD 5.2): the 2014 "spells known" tables are gone — every caster
// prepares. The level-up new-spell pick count is now the prepared-count delta for
// onLevelUp-cadence classes, a flat 2 for the Wizard's spellbook, and 0 for the
// re-prepare classes (Cleric/Druid/Paladin/Ranger). Filename kept per #1127 AC.
import {
  levelUpSpellPicks,
  levelUpCantripPicks,
  cantripsKnownAtLevel,
  preparedSpellCountAt,
  maxSpellLevelForClass,
  magicalSecretsSpellLists,
  spellListsFor,
  level1SpellPicksFor,
} from "@/lib/srd/spellcasting-tables.js";

describe("levelUpSpellPicks — 2024 new-spell pick count on level-up", () => {
  it("Wizard scribes 6 at level 1 — its spellbook size, not its prepared count (#1513) — then a flat 2 per level", () => {
    expect(levelUpSpellPicks("wizard", 1, null, "EDITION_2024")).toBe(6);
    expect(levelUpSpellPicks("wizard", 2, null, "EDITION_2024")).toBe(2);
    expect(levelUpSpellPicks("Wizard", 8, null, "EDITION_2024")).toBe(2);
    expect(levelUpSpellPicks("wizard", 20, null, "EDITION_2024")).toBe(2);
  });

  it("level-1 picks equal the class's prepared count for every caster except Wizard (its spellbook, #1513); 0 for non-casters", () => {
    for (const cls of ["cleric", "druid", "bard", "sorcerer", "warlock", "paladin", "ranger"]) {
      expect(levelUpSpellPicks(cls, 1, null, "EDITION_2024")).toBe(preparedSpellCountAt(cls, 1, null, {}, "EDITION_2024"));
    }
    // Mutation guard: Wizard's level-1 pick (6, the spellbook) must stay distinct
    // from its prepared count (4) — the conflation this issue fixes.
    expect(levelUpSpellPicks("wizard", 1, null, "EDITION_2024")).toBe(6);
    expect(preparedSpellCountAt("wizard", 1, null, {}, "EDITION_2024")).toBe(4);
    expect(levelUpSpellPicks("cleric", 1, null, "EDITION_2024")).toBe(4);
    expect(levelUpSpellPicks("paladin", 1, null, "EDITION_2024")).toBe(2);
    expect(levelUpSpellPicks("fighter", 1, null, "EDITION_2024")).toBe(0);
    expect(levelUpSpellPicks("monk", 1, null, "EDITION_2024")).toBe(0);
  });

  it("Sorcerer offers the prepared-count delta on each onLevelUp level", () => {
    expect(levelUpSpellPicks("sorcerer", 1, null, "EDITION_2024")).toBe(2); // prepares 2 at level 1
    expect(levelUpSpellPicks("sorcerer", 2, null, "EDITION_2024")).toBe(2); // 2 → 4
    expect(levelUpSpellPicks("sorcerer", 4, null, "EDITION_2024")).toBe(1); // 6 → 7
    expect(levelUpSpellPicks("sorcerer", 11, null, "EDITION_2024")).toBe(1); // 15 → 16
    expect(levelUpSpellPicks("sorcerer", 12, null, "EDITION_2024")).toBe(0); // 16 → 16 (swap-only)
  });

  it("Bard offers a delta pick each level (Magical Secrets is a separate flag)", () => {
    expect(levelUpSpellPicks("bard", 2, null, "EDITION_2024")).toBe(1);
    expect(levelUpSpellPicks("bard", 10, null, "EDITION_2024")).toBe(1);
    expect(levelUpSpellPicks("bard", 12, null, "EDITION_2024")).toBe(0);
  });

  it("Warlock offers +1 on growth levels and 0 on flat levels", () => {
    expect(levelUpSpellPicks("warlock", 2, null, "EDITION_2024")).toBe(1);
    expect(levelUpSpellPicks("warlock", 10, null, "EDITION_2024")).toBe(0);
    expect(levelUpSpellPicks("warlock", 11, null, "EDITION_2024")).toBe(1);
  });

  it("re-prepare classes offer only the level-1 initial picks, then 0 (Cleric/Druid/Paladin/Ranger) (#1131)", () => {
    for (const cls of ["cleric", "druid", "paladin", "ranger"]) {
      expect(levelUpSpellPicks(cls, 1, null, "EDITION_2024")).toBe(preparedSpellCountAt(cls, 1, null, {}, "EDITION_2024"));
      for (let lvl = 2; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl, null, "EDITION_2024")).toBe(0);
    }
  });

  it("non-casters never offer a pick", () => {
    for (const cls of ["fighter", "barbarian", "monk"]) {
      for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl, null, "EDITION_2024")).toBe(0);
    }
  });

  it("Eldritch Knight / Arcane Trickster offer the third-caster delta from level 3", () => {
    expect(levelUpSpellPicks("fighter", 3, "Eldritch Knight", "EDITION_2024")).toBe(3); // first prepared: 0 → 3
    expect(levelUpSpellPicks("fighter", 4, "Eldritch Knight", "EDITION_2024")).toBe(1); // 3 → 4
    expect(levelUpSpellPicks("rogue", 12, "Arcane Trickster", "EDITION_2024")).toBe(0); // 8 → 8
  });
});

// #1509: the 2014 known-caster fork. SRD 5.1's "Spells Known of 1st Level and
// Higher" table (Bard/Sorcerer/Ranger, plus the identical-numbers Warlock/EK/AT
// share with 2024) drives the SAME delta arithmetic as the 2024 branch above —
// preparedSpellCountAt already resolves the right table per #1507, so this is a
// pure table-source fork, not a second code path.
describe("levelUpSpellPicks — 2014 known-caster new-spell pick count on level-up (#1509)", () => {
  it("Bard 4→5: SRD 5.1 grants 8-7=1 (2024 grants 9-7=2, the bug #1509 fixes)", () => {
    expect(levelUpSpellPicks("bard", 5, null, "EDITION_2014")).toBe(1);
    expect(levelUpSpellPicks("bard", 5, null, "EDITION_2024")).toBe(2);
  });

  it("Sorcerer 4→5: SRD 5.1 grants 6-5=1 (2024 grants 9-7=2)", () => {
    expect(levelUpSpellPicks("sorcerer", 5, null, "EDITION_2014")).toBe(1);
    expect(levelUpSpellPicks("sorcerer", 5, null, "EDITION_2024")).toBe(2);
  });

  it("Warlock's identical 20-number table gives the same delta in both editions", () => {
    expect(levelUpSpellPicks("warlock", 4, null, "EDITION_2014")).toBe(levelUpSpellPicks("warlock", 4, null, "EDITION_2024"));
    expect(levelUpSpellPicks("warlock", 11, null, "EDITION_2014")).toBe(levelUpSpellPicks("warlock", 11, null, "EDITION_2024"));
  });

  it("Wizard's flat-2 scribe (level >= 2) is edition-invariant", () => {
    expect(levelUpSpellPicks("wizard", 5, null, "EDITION_2014")).toBe(2);
    expect(levelUpSpellPicks("wizard", 5, null, "EDITION_2024")).toBe(2);
  });

  it("2014 Cleric/Druid/Wizard re-prepare — no level-up pick (swapCadenceFor is anyOnLongRest)", () => {
    for (const cls of ["cleric", "druid"]) {
      for (let lvl = 2; lvl <= 20; lvl++) expect(levelUpSpellPicks(cls, lvl, null, "EDITION_2014")).toBe(0);
    }
  });

  it("2014 Paladin re-prepares too — correct by accident today (its 2024 cadence is oneOnLongRest, also 0)", () => {
    for (let lvl = 2; lvl <= 20; lvl++) expect(levelUpSpellPicks("paladin", lvl, null, "EDITION_2014")).toBe(0);
  });

  it("2014 Ranger 1→2: below spellcastingStartLevel the previous count is null, read as 0 (#1509 D3) — the level-2 pick is the FULL initial list (2), not a 2-0-by-accident delta", () => {
    expect(preparedSpellCountAt("ranger", 1, null, {}, "EDITION_2014")).toBeNull();
    expect(levelUpSpellPicks("ranger", 2, null, "EDITION_2014")).toBe(2);
  });

  it("2014 Ranger keeps offering the Spells Known delta at higher levels (SRD 5.1 onLevelUp swap class)", () => {
    expect(levelUpSpellPicks("ranger", 3, null, "EDITION_2014")).toBe(1); // 2 → 3
    expect(levelUpSpellPicks("ranger", 5, null, "EDITION_2014")).toBe(1); // 3 → 4
  });

  it("2024 Ranger re-prepares (oneOnLongRest) — 0 at every level-up past its level-1 initial picks", () => {
    for (let lvl = 2; lvl <= 20; lvl++) expect(levelUpSpellPicks("ranger", lvl, null, "EDITION_2024")).toBe(0);
  });

  it("EK/AT's identical 18-number table gives the same delta in both editions", () => {
    expect(levelUpSpellPicks("fighter", 4, "Eldritch Knight", "EDITION_2014")).toBe(levelUpSpellPicks("fighter", 4, "Eldritch Knight", "EDITION_2024"));
  });
});

describe("level1SpellPicksFor — spellbookSize marks the Wizard's spellbook/prepared split (#1513)", () => {
  it("is 6 for Wizard in BOTH editions; every other caster omits the field", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(level1SpellPicksFor("wizard", null, edition)?.spellbookSize).toBe(6);
      expect(level1SpellPicksFor("wizard", null, edition)?.spells).toBe(6);
    }
    for (const cls of ["bard", "cleric", "sorcerer", "warlock", "paladin", "ranger"]) {
      expect(level1SpellPicksFor(cls, null, "EDITION_2024")?.spellbookSize).toBeUndefined();
    }
    expect(level1SpellPicksFor("fighter", "Eldritch Knight", "EDITION_2024")?.spellbookSize).toBeUndefined();
    expect(level1SpellPicksFor("rogue", "Arcane Trickster", "EDITION_2024")?.spellbookSize).toBeUndefined();
  });
});

describe("levelUpCantripPicks — 2024 cantrip pick count on level-up (#1131)", () => {
  it("offers the cantrips-known delta on a growth level", () => {
    expect(levelUpCantripPicks("warlock", 4)).toBe(1); // 2 → 3
    expect(levelUpCantripPicks("cleric", 4)).toBe(1); // 3 → 4
    expect(levelUpCantripPicks("wizard", 10)).toBe(1); // 4 → 5
  });

  it("level-1 picks equal the full cantrips-known count for every caster", () => {
    for (const cls of ["wizard", "cleric", "druid", "bard", "sorcerer", "warlock"]) {
      expect(levelUpCantripPicks(cls, 1)).toBe(cantripsKnownAtLevel(cls, 1));
    }
  });

  it("is 0 on a flat cantrip level and for Paladin/Ranger (no cantrips)", () => {
    expect(levelUpCantripPicks("warlock", 5)).toBe(0); // 3 → 3
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("paladin", lvl)).toBe(0);
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("ranger", lvl)).toBe(0);
  });

  it("third casters (EK/AT) gain 2 at level 3 and 1 more at level 10", () => {
    expect(levelUpCantripPicks("fighter", 3, "Eldritch Knight")).toBe(2); // 0 → 2
    expect(levelUpCantripPicks("rogue", 10, "Arcane Trickster")).toBe(1); // 2 → 3
  });

  it("is 0 for a non-caster at every level", () => {
    for (let lvl = 1; lvl <= 20; lvl++) expect(levelUpCantripPicks("fighter", lvl)).toBe(0);
  });
});

describe("maxSpellLevelForClass", () => {
  it("derives the highest slot level a full caster has (ceiling climbs every other level)", () => {
    expect(maxSpellLevelForClass("wizard", 1, null, "EDITION_2024")).toBe(1);
    expect(maxSpellLevelForClass("wizard", 3, null, "EDITION_2024")).toBe(2);
    expect(maxSpellLevelForClass("wizard", 8, null, "EDITION_2024")).toBe(4);
    expect(maxSpellLevelForClass("wizard", 9, null, "EDITION_2024")).toBe(5);
    expect(maxSpellLevelForClass("Bard", 10, null, "EDITION_2024")).toBe(5);
  });

  it("half-casters cast from level 1 (SRD 5.2), then climb the half-caster ceiling", () => {
    expect(maxSpellLevelForClass("ranger", 1, null, "EDITION_2024")).toBe(1);
    expect(maxSpellLevelForClass("ranger", 2, null, "EDITION_2024")).toBe(1);
    expect(maxSpellLevelForClass("ranger", 5, null, "EDITION_2024")).toBe(2);
  });

  it("reads Pact Magic's single slot level for a Warlock", () => {
    expect(maxSpellLevelForClass("warlock", 1, null, "EDITION_2024")).toBe(1);
    expect(maxSpellLevelForClass("warlock", 3, null, "EDITION_2024")).toBe(2);
    expect(maxSpellLevelForClass("warlock", 9, null, "EDITION_2024")).toBe(5);
  });

  it("is 0 for a non-caster (no derived slots)", () => {
    expect(maxSpellLevelForClass("fighter", 5, null, "EDITION_2024")).toBe(0);
    expect(maxSpellLevelForClass("barbarian", 20, null, "EDITION_2024")).toBe(0);
  });

  it("2014 half-casters cast from level 2, not level 1 (#1507 D4)", () => {
    expect(maxSpellLevelForClass("ranger", 1, null, "EDITION_2014")).toBe(0);
    expect(maxSpellLevelForClass("paladin", 1, null, "EDITION_2014")).toBe(0);
    expect(maxSpellLevelForClass("ranger", 2, null, "EDITION_2014")).toBe(1);
  });
});

describe("magicalSecretsSpellLists — Bard Magical Secrets, edition-forked", () => {
  it("2024 Bard at level 10 broadens SPELLS to the Bard/Cleric/Druid/Wizard lists (SRD 5.2)", () => {
    expect(magicalSecretsSpellLists("bard", 10, null, "EDITION_2024").spells).toEqual([
      "bard", "cleric", "druid", "wizard",
    ]);
  });

  it("2024 Bard at level 10 does NOT broaden cantrips — the trigger is the Prepared Spells number", () => {
    expect(magicalSecretsSpellLists("bard", 10, null, "EDITION_2024").cantrips).toEqual(["bard"]);
  });

  it("2024 Bard keeps the broadened spell lists at every level above 10 (level >= 10, not === 10)", () => {
    for (const level of [11, 14, 20]) {
      expect(magicalSecretsSpellLists("bard", level, null, "EDITION_2024").spells).toEqual([
        "bard", "cleric", "druid", "wizard",
      ]);
    }
  });

  it("2024 Bard below level 10 is restricted to its own list on both facets", () => {
    expect(magicalSecretsSpellLists("bard", 9, null, "EDITION_2024")).toEqual({
      spells: ["bard"],
      cantrips: ["bard"],
    });
  });

  it('2014 Bard from level 10 is unrestricted on BOTH facets (PHB\'14 p. 54 "from any class … or a cantrip")', () => {
    for (const level of [10, 14, 18, 20]) {
      expect(magicalSecretsSpellLists("bard", level, null, "EDITION_2014")).toEqual({
        spells: null,
        cantrips: null,
      });
    }
  });

  it("2014 Bard below level 10 is restricted to its own list on both facets", () => {
    expect(magicalSecretsSpellLists("bard", 9, null, "EDITION_2014")).toEqual({
      spells: ["bard"],
      cantrips: ["bard"],
    });
  });

  it("every non-Bard class is its own list on both facets, in both editions", () => {
    expect(magicalSecretsSpellLists("wizard", 20, null, "EDITION_2024")).toEqual({ spells: ["wizard"], cantrips: ["wizard"] });
    expect(magicalSecretsSpellLists("cleric", 10, null, "EDITION_2024")).toEqual({ spells: ["cleric"], cantrips: ["cleric"] });
    expect(magicalSecretsSpellLists("sorcerer", 10, null, "EDITION_2014")).toEqual({ spells: ["sorcerer"], cantrips: ["sorcerer"] });
  });

  it("matches the class name case-insensitively and returns lowercase", () => {
    expect(magicalSecretsSpellLists("Bard", 10, null, "EDITION_2024").spells).toEqual([
      "bard", "cleric", "druid", "wizard",
    ]);
    expect(magicalSecretsSpellLists("Warlock", 20, null, "EDITION_2024")).toEqual({
      spells: ["warlock"],
      cantrips: ["warlock"],
    });
  });
});

// #1825: spellListsFor is the single resolver "which spell list(s) may this
// character pick from" — it owns the plain single-class default, the EK/AT →
// wizard redirect, AND Bard Magical Secrets (magicalSecretsSpellLists folds
// into it, kept as a delegate above so its own describe block stays green
// unchanged). The live bug: the class's own default branch used to assume the
// spell-list key equals the lowercased class name, which for a third-caster
// subclass (Eldritch Knight / Arcane Trickster) is "fighter"/"rogue" — no
// catalog spell is ever on those lists, so the New Spells step served an
// empty picker. EK/AT actually draw from the WIZARD list — PHB'14 p. 75
// (Eldritch Knight) / p. 98 (Arcane Trickster), byte-identical in PHB'24.
describe("spellListsFor — the single class+subclass+edition spell-list resolver (#1825)", () => {
  it("redirects Eldritch Knight to the wizard list on both facets, in both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(spellListsFor("fighter", 3, "eldritch knight", edition)).toEqual({
        spells: ["wizard"],
        cantrips: ["wizard"],
      });
    }
  });

  it("redirects Arcane Trickster to the wizard list on both facets, in both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(spellListsFor("rogue", 3, "arcane trickster", edition)).toEqual({
        spells: ["wizard"],
        cantrips: ["wizard"],
      });
    }
  });

  it("matches the subclass name case-insensitively, and the redirect holds at every level", () => {
    expect(spellListsFor("fighter", 12, "Eldritch Knight", "EDITION_2024")).toEqual({
      spells: ["wizard"],
      cantrips: ["wizard"],
    });
  });

  it("a plain class with no third-caster subclass keeps its own list, unchanged", () => {
    expect(spellListsFor("wizard", 5, null, "EDITION_2024")).toEqual({ spells: ["wizard"], cantrips: ["wizard"] });
    expect(spellListsFor("fighter", 5, "champion", "EDITION_2024")).toEqual({ spells: ["fighter"], cantrips: ["fighter"] });
  });

  it("folds in Bard Magical Secrets with the edition-forked concrete outputs", () => {
    // Below the level-10 gate: the plain Bard list on both facets, both editions.
    expect(spellListsFor("bard", 9, null, "EDITION_2014")).toEqual({ spells: ["bard"], cantrips: ["bard"] });
    expect(spellListsFor("bard", 9, null, "EDITION_2024")).toEqual({ spells: ["bard"], cantrips: ["bard"] });
    // 2014 (PHB'14 p. 54): unrestricted on both facets from level 10.
    expect(spellListsFor("bard", 10, null, "EDITION_2014")).toEqual({ spells: null, cantrips: null });
    expect(spellListsFor("bard", 20, null, "EDITION_2014")).toEqual({ spells: null, cantrips: null });
    // 2024 (SRD 5.2 / PHB'24 p. 53): spells widen to Bard/Cleric/Druid/Wizard,
    // cantrips do NOT (the Prepared Spells trigger is level 1+ only).
    expect(spellListsFor("bard", 10, null, "EDITION_2024")).toEqual({ spells: ["bard", "cleric", "druid", "wizard"], cantrips: ["bard"] });
    expect(spellListsFor("bard", 14, null, "EDITION_2024")).toEqual({ spells: ["bard", "cleric", "druid", "wizard"], cantrips: ["bard"] });
  });

  it("magicalSecretsSpellLists now delegates to spellListsFor, so EK/AT are fixed through the old call name too", () => {
    expect(magicalSecretsSpellLists("fighter", 3, "Eldritch Knight", "EDITION_2024")).toEqual({
      spells: ["wizard"],
      cantrips: ["wizard"],
    });
  });
});
