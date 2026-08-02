// #1226 commit 2 of 3: Druid's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 VALUE (a spell reference, a
// damage die, a level, a mechanic name) — Circle of the Land is transcribed
// from SRD 5.2's own raw text; Circle of the Moon is mirror-sourced
// (dnd2024.wikidot.com + wastedwizardgames.com, see druid-features.ts's own
// header) — never against "differs from the 2014 row", which a garbage 2024
// paraphrase would also satisfy. Mirrors ranger-2024-content.test.ts's
// row()/hasRow() shape (same file, same DRUID_FEATURES export).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { DRUID_FEATURES } from "../druid-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return DRUID_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
}

/** Exactly one row for (subclassSlug, name, edition), or the test fails with a precise locator. */
function row(subclassSlug: string | null, name: string, edition: Edition) {
  const found = rowsNamed(subclassSlug, name).filter((r) => r.edition === edition);
  expect(found, `${subclassSlug ?? "(base)"}/${name}/${edition}`).toHaveLength(1);
  return found[0];
}

function hasRow(subclassSlug: string | null, name: string, edition: Edition): boolean {
  return rowsNamed(subclassSlug, name).some((r) => r.edition === edition);
}

const BASE = null;
const LAND = "druid-circle-of-the-land";
const MOON = "druid-circle-of-the-moon";

describe("Druidic (#1226): adds always-prepared Speak with Animals, Investigation over Perception", () => {
  it("2024 mentions Speak with Animals and Intelligence (Investigation); 2014 does neither", () => {
    const r2024 = row(BASE, "Druidic", "EDITION_2024");
    expect(r2024.description).toContain("Speak with Animals");
    expect(r2024.description).toContain("Intelligence (Investigation)");
    const r2014 = row(BASE, "Druidic", "EDITION_2014");
    expect(r2014.description).not.toContain("Speak with Animals");
    expect(r2014.description).not.toContain("Wisdom (Perception)");
  });
});

describe("Spellcasting (#1226): fixed per-level prepared table, not Wisdom-modifier-plus-level", () => {
  it("2024 does not use the 2014 formula", () => {
    expect(row(BASE, "Spellcasting", "EDITION_2024").description).not.toContain("Wisdom modifier + your druid level");
    expect(row(BASE, "Spellcasting", "EDITION_2014").description).toContain("Wisdom modifier + your druid level");
  });
});

describe("Primal Order (#1226 correction 3): the bonus is to Intelligence checks, EQUAL TO your Wisdom modifier", () => {
  it("2024 names the Wisdom modifier, Martial weapons, and Medium armor, and never says Intelligence modifier", () => {
    const r2024 = row(BASE, "Primal Order", "EDITION_2024");
    expect(r2024.description).toContain("Wisdom modifier");
    expect(r2024.description).toContain("Martial weapons");
    expect(r2024.description).toContain("Medium armor");
    expect(r2024.description).not.toContain("Intelligence modifier");
    expect(hasRow(BASE, "Primal Order", "EDITION_2014")).toBe(false);
  });
});

describe("Wild Shape (#1226): Bonus Action, Fly-only speed gate, temp HP = Druid level", () => {
  it("2024 contains the new shape and drops the 2014 restrictions", () => {
    const r2024 = row(BASE, "Wild Shape", "EDITION_2024");
    expect(r2024.description).toContain("Bonus Action");
    expect(r2024.description).toContain("Temporary Hit Points equal to your Druid level");
    expect(r2024.description).toContain("one expended use when you finish a Short Rest");
    expect(r2024.description).toContain("Fly Speed");
    expect(r2024.description).not.toContain("no flying or swimming speed");
    expect(r2024.description).not.toMatch(/swimming/i);
    expect(r2024.description).not.toMatch(/\bas an action\b/i);
  });

  it("2014 still reads as an Action with the old speed-gate note", () => {
    const r2014 = row(BASE, "Wild Shape", "EDITION_2014");
    expect(r2014.description).toContain("As an action");
    expect(r2014.description).toContain("no flying or swimming speed");
  });
});

describe("Wild Companion / Wild Resurgence (#1226): NEW in 2024", () => {
  it("Wild Companion casts Find Familiar; Wild Resurgence's Long-Rest clause names a level 1 spell slot", () => {
    expect(row(BASE, "Wild Companion", "EDITION_2024").description).toContain("Find Familiar");
    expect(row(BASE, "Wild Resurgence", "EDITION_2024").description).toContain("level 1 spell slot");
    expect(hasRow(BASE, "Wild Companion", "EDITION_2014")).toBe(false);
    expect(hasRow(BASE, "Wild Resurgence", "EDITION_2014")).toBe(false);
  });
});

describe("Elemental Fury / Improved Elemental Fury (#1226): NEW in 2024, absorbs Circle of the Moon's old Primal Strike name", () => {
  it("Elemental Fury names both options and the 1d8; Improved Elemental Fury upgrades to 2d8 and +300 feet", () => {
    const fury = row(BASE, "Elemental Fury", "EDITION_2024");
    expect(fury.description).toContain("Potent Spellcasting");
    expect(fury.description).toContain("Primal Strike");
    expect(fury.description).toContain("1d8");
    expect(fury.level).toBe(7);

    const improved = row(BASE, "Improved Elemental Fury", "EDITION_2024");
    expect(improved.description).toContain("2d8");
    expect(improved.description).toContain("300 feet");
    expect(improved.level).toBe(15);
  });
});

describe("Beast Spells (#1226): tightens the Material-component exclusion", () => {
  it("2024 excludes costed/consumed Material components; 2014 doesn't mention Material components at all", () => {
    expect(row(BASE, "Beast Spells", "EDITION_2024").description).toContain("Material component");
    expect(row(BASE, "Beast Spells", "EDITION_2014").description).not.toContain("Material component");
  });
});

describe("Epic Boon (#1226 correction 6): authored as a text row, matching Fighter's/Barbarian's precedent", () => {
  it("level 19, no 2014 counterpart", () => {
    expect(row(BASE, "Epic Boon", "EDITION_2024").level).toBe(19);
    expect(hasRow(BASE, "Epic Boon", "EDITION_2014")).toBe(false);
  });
});

describe("Archdruid (#1226): full rewrite, no unlimited-uses sentinel, folds in Timeless Body", () => {
  it("2024 names all three benefits and drops every 2014-only phrase", () => {
    const r2024 = row(BASE, "Archdruid", "EDITION_2024");
    expect(r2024.description).toContain("Evergreen Wild Shape");
    expect(r2024.description).toContain("Nature Magician");
    expect(r2024.description).toContain("Longevity");
    expect(r2024.description).toContain("roll Initiative");
    expect(r2024.description).not.toMatch(/unlimited/i);
    expect(r2024.description).not.toContain("ignore the verbal and somatic");
  });

  it("2014 still contains the unlimited-uses sentinel", () => {
    expect(row(BASE, "Archdruid", "EDITION_2014").description).toMatch(/unlimited/i);
  });

  it("Timeless Body has no EDITION_2024 row — folded into Archdruid's Longevity", () => {
    expect(hasRow(BASE, "Timeless Body", "EDITION_2024")).toBe(false);
    expect(hasRow(BASE, "Timeless Body", "EDITION_2014")).toBe(true);
  });
});

describe("Removed-in-2024 base features: the strongest single stale-copy detector", () => {
  it.each(["Timeless Body"])("%s has no EDITION_2024 row", (name) => {
    expect(hasRow(BASE, name, "EDITION_2024")).toBe(false);
    expect(hasRow(BASE, name, "EDITION_2014")).toBe(true);
  });
});

describe("Circle of the Land (#1226): Circle Spells renames, not edits in place", () => {
  it("Circle Spells has no EDITION_2024 row; Circle of the Land Spells has no EDITION_2014 row", () => {
    expect(hasRow(LAND, "Circle Spells", "EDITION_2024")).toBe(false);
    expect(hasRow(LAND, "Circle of the Land Spells", "EDITION_2014")).toBe(false);
    expect(hasRow(LAND, "Circle Spells", "EDITION_2014")).toBe(true);
  });

  it("Circle of the Land Spells names all four terrains and none of the eight 2014 ones", () => {
    const r2024 = row(LAND, "Circle of the Land Spells", "EDITION_2024");
    for (const terrain of ["arid", "polar", "temperate", "tropical"]) {
      expect(r2024.description).toContain(terrain);
    }
    expect(r2024.description).not.toMatch(/arctic|Underdark|swamp|grassland/);
  });

  it("Land's Aid is new at level 3, with 2d6/3d6/4d6 Necrotic", () => {
    const r2024 = row(LAND, "Land's Aid", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("2d6");
    expect(r2024.description).toContain("3d6");
    expect(r2024.description).toContain("4d6");
    expect(r2024.description).toContain("Necrotic");
    expect(hasRow(LAND, "Land's Aid", "EDITION_2014")).toBe(false);
  });

  it("Natural Recovery level-shifts 2 -> 6", () => {
    expect(row(LAND, "Natural Recovery", "EDITION_2024").level).toBe(6);
    expect(row(LAND, "Natural Recovery", "EDITION_2014").level).toBe(2);
  });

  it("Nature's Ward names the Poisoned condition and all four land resistances, drops disease/charm", () => {
    const r2024 = row(LAND, "Nature's Ward", "EDITION_2024");
    expect(r2024.description).toContain("Poisoned");
    for (const damageType of ["Fire", "Cold", "Lightning", "Poison"]) {
      expect(r2024.description).toContain(damageType);
    }
    expect(r2024.description).not.toContain("disease");
    expect(r2024.description).not.toMatch(/charm/i);
  });

  it("Nature's Sanctuary drops the saving throw entirely, names the 15-foot Cube and Half Cover", () => {
    const r2024 = row(LAND, "Nature's Sanctuary", "EDITION_2024");
    expect(r2024.description).toContain("15-foot Cube");
    expect(r2024.description).toContain("Half Cover");
    expect(r2024.description).not.toContain("saving throw");
  });

  it.each(["Bonus Cantrip", "Land's Stride"])("%s has no EDITION_2024 row", (name) => {
    expect(hasRow(LAND, name, "EDITION_2024")).toBe(false);
    expect(hasRow(LAND, name, "EDITION_2014")).toBe(true);
  });

  it("row counts: 6 EDITION_2014, 5 EDITION_2024", () => {
    expect(DRUID_FEATURES.filter((r) => r.subclassSlug === LAND && r.edition === "EDITION_2014")).toHaveLength(6);
    expect(DRUID_FEATURES.filter((r) => r.subclassSlug === LAND && r.edition === "EDITION_2024")).toHaveLength(5);
  });
});

describe("Circle of the Moon (#1226, mirror-sourced): Circle Forms level-shifts 2 -> 3, drops the level-6 step", () => {
  it("2024 names divided by 3, the AC floor, and the temp-HP override, and never says 'Starting at level 6'", () => {
    const r2024 = row(MOON, "Circle Forms", "EDITION_2024");
    expect(r2024.level).toBe(3);
    expect(r2024.description).toContain("divided by 3");
    expect(r2024.description).toContain("13 plus your Wisdom modifier");
    expect(r2024.description).toContain("three times your Druid level");
    expect(r2024.description).not.toContain("Starting at level 6");
    expect(row(MOON, "Circle Forms", "EDITION_2014").level).toBe(2);
  });

  it("Improved Circle Forms names Lunar Radiance and Constitution saving throws, replacing Primal Strike", () => {
    const r2024 = row(MOON, "Improved Circle Forms", "EDITION_2024");
    expect(r2024.level).toBe(6);
    expect(r2024.description).toContain("Lunar Radiance");
    expect(r2024.description).toContain("Constitution saving throws");
    expect(hasRow(MOON, "Primal Strike", "EDITION_2024")).toBe(false);
    expect(hasRow(MOON, "Primal Strike", "EDITION_2014")).toBe(true);
  });

  it("Moonlight Step replaces Elemental Wild Shape at level 10, names 30 feet / Wisdom modifier / a level-2+ spell slot", () => {
    const r2024 = row(MOON, "Moonlight Step", "EDITION_2024");
    expect(r2024.level).toBe(10);
    expect(r2024.description).toContain("30 feet");
    expect(r2024.description).toContain("Wisdom modifier");
    expect(r2024.description).toContain("spell slot of level 2");
    expect(hasRow(MOON, "Elemental Wild Shape", "EDITION_2024")).toBe(false);
    expect(hasRow(MOON, "Elemental Wild Shape", "EDITION_2014")).toBe(true);
  });

  it("Lunar Form replaces Thousand Forms at level 14, names 2d10 Radiant", () => {
    const r2024 = row(MOON, "Lunar Form", "EDITION_2024");
    expect(r2024.level).toBe(14);
    expect(r2024.description).toContain("2d10");
    expect(r2024.description).toContain("Radiant");
    expect(hasRow(MOON, "Thousand Forms", "EDITION_2024")).toBe(false);
    expect(hasRow(MOON, "Thousand Forms", "EDITION_2014")).toBe(true);
  });

  it("Circle of the Moon Spells is new at level 3", () => {
    expect(row(MOON, "Circle of the Moon Spells", "EDITION_2024").level).toBe(3);
    expect(hasRow(MOON, "Circle of the Moon Spells", "EDITION_2014")).toBe(false);
  });

  it.each(["Combat Wild Shape"])("%s has no EDITION_2024 row (baseline now)", (name) => {
    expect(hasRow(MOON, name, "EDITION_2024")).toBe(false);
    expect(hasRow(MOON, name, "EDITION_2014")).toBe(true);
  });

  it("row counts: 5 EDITION_2014, 5 EDITION_2024", () => {
    expect(DRUID_FEATURES.filter((r) => r.subclassSlug === MOON && r.edition === "EDITION_2014")).toHaveLength(5);
    expect(DRUID_FEATURES.filter((r) => r.subclassSlug === MOON && r.edition === "EDITION_2024")).toHaveLength(5);
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = DRUID_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("row counts (#1226): 17 EDITION_2014 (unchanged, pinned) vs 21 EDITION_2024, 38 total", () => {
  it("EDITION_2014 stays 17; EDITION_2024 is 21", () => {
    expect(DRUID_FEATURES.filter((r) => r.edition === "EDITION_2014")).toHaveLength(17);
    expect(DRUID_FEATURES.filter((r) => r.edition === "EDITION_2024")).toHaveLength(21);
    expect(DRUID_FEATURES).toHaveLength(38);
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 12,
  intelligence: 8,
  wisdom: 16,
  charisma: 10,
};

// Integration-level proof (mirrors ranger-2024-content.test.ts's
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived features —
// not just DRUID_FEATURES' in-memory shape.
describe("integration (#1226): a level-20 Circle of the Moon Druid's derived features differ by edition exactly where authored", () => {
  it("2024 has Primal Order/Wild Companion/Wild Resurgence/Elemental Fury/Improved Elemental Fury/Epic Boon/Circle of the Moon Spells/Improved Circle Forms/Moonlight Step/Lunar Form and NOT Timeless Body/Combat Wild Shape/Primal Strike/Elemental Wild Shape/Thousand Forms; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("druid", "circle of the moon");
    const profBonus = proficiencyBonusForLevel(20);

    const info2014 = deriveResources("druid", "circle of the moon", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("druid", "circle of the moon", 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Timeless Body")).toBe(true);
    expect(names2014.has("Combat Wild Shape")).toBe(true);
    expect(names2014.has("Primal Strike")).toBe(true);
    expect(names2014.has("Elemental Wild Shape")).toBe(true);
    expect(names2014.has("Thousand Forms")).toBe(true);
    expect(names2014.has("Primal Order")).toBe(false);
    expect(names2014.has("Epic Boon")).toBe(false);
    expect(names2014.has("Moonlight Step")).toBe(false);

    expect(names2024.has("Primal Order")).toBe(true);
    expect(names2024.has("Wild Companion")).toBe(true);
    expect(names2024.has("Wild Resurgence")).toBe(true);
    expect(names2024.has("Elemental Fury")).toBe(true);
    expect(names2024.has("Improved Elemental Fury")).toBe(true);
    expect(names2024.has("Epic Boon")).toBe(true);
    expect(names2024.has("Circle of the Moon Spells")).toBe(true);
    expect(names2024.has("Improved Circle Forms")).toBe(true);
    expect(names2024.has("Moonlight Step")).toBe(true);
    expect(names2024.has("Lunar Form")).toBe(true);
    expect(names2024.has("Timeless Body")).toBe(false);
    expect(names2024.has("Combat Wild Shape")).toBe(false);
    expect(names2024.has("Primal Strike")).toBe(false);
    expect(names2024.has("Elemental Wild Shape")).toBe(false);
    expect(names2024.has("Thousand Forms")).toBe(false);
  });
});
