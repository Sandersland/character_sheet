// #1234 commit 2 of 4: Wizard's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 / PHB'24 VALUE (a level, a
// restriction, a mechanic delta) transcribed from the researched source list
// (dndbeyond.com/srd for the base class + Evoker, cross-checked against two
// independent mirrors for Abjurer/Illusionist, which aren't in SRD 5.2) —
// never against "differs from the 2014 row", which a garbage 2024 paraphrase
// would also satisfy. Mirrors wizard-2014-snapshot.test.ts's shape (same
// file, same WIZARD_FEATURES export) but pins the OTHER edition.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { WIZARD_FEATURES } from "../wizard-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return WIZARD_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const EVOCATION = "wizard-school-of-evocation";
const ABJURATION = "wizard-school-of-abjuration";
const ILLUSION = "wizard-school-of-illusion";

describe("2024-only base rows exist at the right levels with no 2014 twin (#1234)", () => {
  it.each([
    ["Ritual Adept", 1],
    ["Scholar", 2],
    ["Memorize Spell", 5],
    ["Epic Boon", 19],
  ])("%s at level %i is 2024-only", (name, level) => {
    const r2024 = row(BASE, name, "EDITION_2024");
    expect(r2024.level).toBe(level);
    expect(hasRow(BASE, name, "EDITION_2014")).toBe(false);
  });
});

describe("Spell Mastery (#1234): 2024 restricts both picks to a casting time of an action; 2014 does not", () => {
  it("2024 contains the casting-time-of-an-action restriction", () => {
    expect(row(BASE, "Spell Mastery", "EDITION_2024").description).toContain("casting time of an action");
  });

  it("2014 has no such restriction, and keeps its 8-hours-of-study wording", () => {
    const r2014 = row(BASE, "Spell Mastery", "EDITION_2014");
    expect(r2014.description).not.toContain("casting time of an action");
    expect(r2014.description).toContain("8 hours of study");
  });
});

describe("Signature Spells (#1234): verified against the SRD 5.2 document — NO casting-time-of-an-action restriction in either edition", () => {
  it("2024 does not restrict the two picks to a casting time of an action (a planning-stage bullet claiming otherwise is not authored)", () => {
    expect(row(BASE, "Signature Spells", "EDITION_2024").description).not.toContain("casting time of an action");
  });
});

describe("Arcane Recovery (#1234): 2024 is Long Rest + Short Rest wording; 2014 is the 'Once per day' sentence", () => {
  it("2024 contains Long Rest and Short Rest, not 'Once per day'", () => {
    const r2024 = row(BASE, "Arcane Recovery", "EDITION_2024");
    expect(r2024.description).toContain("Long Rest");
    expect(r2024.description).toContain("Short Rest");
    expect(r2024.description).not.toContain("Once per day");
  });

  it("2014 contains 'Once per day'", () => {
    expect(row(BASE, "Arcane Recovery", "EDITION_2014").description).toContain("Once per day");
  });
});

describe("Evocation Savant / Abjuration Savant / Illusion Savant (#1234): 2024 grants free spells onto the spellbook, not a halved copy cost", () => {
  it.each([
    [EVOCATION, "Evocation Savant"],
    [ABJURATION, "Abjuration Savant"],
    [ILLUSION, "Illusion Savant"],
  ])("%s's %s 2024 mentions spellbook + free grant, not 'halved'; 2014 still halves the copy cost", (slug, name) => {
    const r2024 = row(slug, name, "EDITION_2024");
    expect(r2024.description).toContain("spellbook");
    expect(r2024.description).not.toContain("halved");

    const r2014 = row(slug, name, "EDITION_2014");
    expect(r2014.description).toContain("halved");
  });
});

describe("Evocation Savant / Potent Cantrip / Sculpt Spells (#1234): level shifts", () => {
  it("Evocation Savant: level 2 in 2014, level 3 in 2024", () => {
    expect(row(EVOCATION, "Evocation Savant", "EDITION_2014").level).toBe(2);
    expect(row(EVOCATION, "Evocation Savant", "EDITION_2024").level).toBe(3);
  });

  it("Potent Cantrip: level 6 in 2014, level 3 in 2024", () => {
    expect(row(EVOCATION, "Potent Cantrip", "EDITION_2014").level).toBe(6);
    expect(row(EVOCATION, "Potent Cantrip", "EDITION_2024").level).toBe(3);
  });

  it("Sculpt Spells: level 2 in 2014, level 6 in 2024", () => {
    expect(row(EVOCATION, "Sculpt Spells", "EDITION_2014").level).toBe(2);
    expect(row(EVOCATION, "Sculpt Spells", "EDITION_2024").level).toBe(6);
  });
});

describe("Potent Cantrip (#1234): 2024 triggers on a missed attack roll too, not only a failed save", () => {
  it("2024 contains 'miss' and 'attack roll'", () => {
    const r2024 = row(EVOCATION, "Potent Cantrip", "EDITION_2024");
    expect(r2024.description).toContain("miss");
    expect(r2024.description).toContain("attack roll");
  });

  it("2014 contains 'succeeds on a saving throw' and never mentions a miss", () => {
    const r2014 = row(EVOCATION, "Potent Cantrip", "EDITION_2014");
    expect(r2014.description).toContain("succeeds on a saving throw");
    expect(r2014.description).not.toContain("miss");
  });
});

describe("Abjuration Savant / Arcane Ward / Projected Ward / Spell Resistance (#1234): level shifts", () => {
  it("Abjuration Savant: level 2 in 2014, level 3 in 2024", () => {
    expect(row(ABJURATION, "Abjuration Savant", "EDITION_2014").level).toBe(2);
    expect(row(ABJURATION, "Abjuration Savant", "EDITION_2024").level).toBe(3);
  });

  it("Arcane Ward: level 2 in 2014, level 3 in 2024", () => {
    expect(row(ABJURATION, "Arcane Ward", "EDITION_2014").level).toBe(2);
    expect(row(ABJURATION, "Arcane Ward", "EDITION_2024").level).toBe(3);
  });

  it("Projected Ward and Spell Resistance stay at their 2014 levels (6, 14) in 2024 too", () => {
    expect(row(ABJURATION, "Projected Ward", "EDITION_2024").level).toBe(6);
    expect(row(ABJURATION, "Spell Resistance", "EDITION_2024").level).toBe(14);
  });
});

describe("Arcane Ward / Projected Ward (#1234): 2024 states resistances/vulnerabilities apply BEFORE the ward's HP is reduced", () => {
  it("2024 rows mention applying Resistances/Vulnerabilities before the ward's HP is reduced", () => {
    expect(row(ABJURATION, "Arcane Ward", "EDITION_2024").description).toContain("before");
    expect(row(ABJURATION, "Arcane Ward", "EDITION_2024").description).toContain("Resistances or Vulnerabilities");
    expect(row(ABJURATION, "Projected Ward", "EDITION_2024").description).toContain("Resistances or Vulnerabilities");
  });
});

describe("Spell Breaker (#1234): 2024 exists at level 10; Improved Abjuration has no 2024 successor", () => {
  it("Spell Breaker 2024 exists at level 10 and grants Counterspell + Dispel Magic always prepared, a Bonus Action cast, and +PB to its check", () => {
    const r = row(ABJURATION, "Spell Breaker", "EDITION_2024");
    expect(r.level).toBe(10);
    expect(r.description).toContain("Counterspell");
    expect(r.description).toContain("Dispel Magic");
    expect(r.description).toContain("Bonus Action");
    expect(r.description).toContain("Proficiency Bonus");
  });

  it("Improved Abjuration 2014 still exists at level 10; no EDITION_2024 row exists for it", () => {
    expect(row(ABJURATION, "Improved Abjuration", "EDITION_2014").level).toBe(10);
    expect(hasRow(ABJURATION, "Improved Abjuration", "EDITION_2024")).toBe(false);
  });
});

describe("Illusion Savant / Improved Illusions / Phantasmal Creatures (#1234): renames and level shifts", () => {
  it("Illusion Savant: level 2 in 2014, level 3 in 2024", () => {
    expect(row(ILLUSION, "Illusion Savant", "EDITION_2014").level).toBe(2);
    expect(row(ILLUSION, "Illusion Savant", "EDITION_2024").level).toBe(3);
  });

  it("Improved Minor Illusion (2014, level 2) has no EDITION_2024 row under that name — Improved Illusions (2024, level 3) is a DIFFERENT name, never a same-named pair", () => {
    expect(row(ILLUSION, "Improved Minor Illusion", "EDITION_2014").level).toBe(2);
    expect(hasRow(ILLUSION, "Improved Minor Illusion", "EDITION_2024")).toBe(false);
    expect(row(ILLUSION, "Improved Illusions", "EDITION_2024").level).toBe(3);
    expect(hasRow(ILLUSION, "Improved Illusions", "EDITION_2014")).toBe(false);
  });

  it("Improved Illusions 2024 drops the Verbal-component requirement on Illusion spells (present in mirror sources, checked before authoring)", () => {
    expect(row(ILLUSION, "Improved Illusions", "EDITION_2024").description).toContain("without a Verbal component");
  });

  it("Malleable Illusions (2014, level 6) has no EDITION_2024 row — Phantasmal Creatures (2024, level 6) fills its slot with a different mechanic", () => {
    expect(row(ILLUSION, "Malleable Illusions", "EDITION_2014").level).toBe(6);
    expect(hasRow(ILLUSION, "Malleable Illusions", "EDITION_2024")).toBe(false);
    const r = row(ILLUSION, "Phantasmal Creatures", "EDITION_2024");
    expect(r.level).toBe(6);
    expect(r.description).toContain("Summon Beast");
    expect(r.description).toContain("Summon Fey");
  });
});

describe("Illusory Self (#1234): 2024 adds the level-2+ spell-slot restore, alongside the unchanged short-or-long-rest recharge", () => {
  it("2024 mentions restoring the use by expending a spell slot; 2014 does not", () => {
    const r2024 = row(ILLUSION, "Illusory Self", "EDITION_2024");
    expect(r2024.description).toContain("spell slot");
    const r2014 = row(ILLUSION, "Illusory Self", "EDITION_2014");
    expect(r2014.description).not.toContain("spell slot");
  });

  it("both editions stay at level 10", () => {
    expect(row(ILLUSION, "Illusory Self", "EDITION_2014").level).toBe(10);
    expect(row(ILLUSION, "Illusory Self", "EDITION_2024").level).toBe(10);
  });
});

describe("Per-partition counts: base 4/8, evocation 5/5, abjuration 5/5, illusion 5/5 (2014/2024) (#1234)", () => {
  it("counts match exactly (19 total 2014, 23 total 2024)", () => {
    const count = (slug: string | null, edition: Edition) => WIZARD_FEATURES.filter((r) => r.subclassSlug === slug && r.edition === edition).length;
    expect(count(BASE, "EDITION_2014")).toBe(4);
    expect(count(BASE, "EDITION_2024")).toBe(8);
    expect(count(EVOCATION, "EDITION_2014")).toBe(5);
    expect(count(EVOCATION, "EDITION_2024")).toBe(5);
    expect(count(ABJURATION, "EDITION_2014")).toBe(5);
    // Same total as 2014 — Improved Abjuration drops out, Spell Breaker fills
    // its slot, so the row COUNT matches while the NAME set doesn't (see the
    // "Spell Breaker" describe block above).
    expect(count(ABJURATION, "EDITION_2024")).toBe(5);
    expect(count(ILLUSION, "EDITION_2014")).toBe(5);
    expect(count(ILLUSION, "EDITION_2024")).toBe(5);
    const total2014 = WIZARD_FEATURES.filter((r) => r.edition === "EDITION_2014").length;
    const total2024 = WIZARD_FEATURES.filter((r) => r.edition === "EDITION_2024").length;
    expect(total2014).toBe(19);
    expect(total2024).toBe(23);
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = WIZARD_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 18,
  wisdom: 13,
  charisma: 8,
};

// Integration-level proof (mirrors barbarian-2024-content.test.ts's own
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived features —
// not just WIZARD_FEATURES' in-memory shape. L6 does NOT distinguish the two
// editions here — by L6 a 2014 Evoker has reached BOTH Sculpt Spells (gate 2)
// and Potent Cantrip (gate 6), same as a 2024 Evoker (gates 6 and 3) — the
// level where the swapped gates actually diverge is L3: a 2024 Evoker has
// reached Potent Cantrip (gate 3) but not Sculpt Spells (gate 6 in 2024); a
// 2014 Evoker at the same level 3 has reached Sculpt Spells (gate 2 in 2014)
// but not Potent Cantrip (gate 6 in 2014) — the exact opposite pairing.
describe("integration (#1234): a L3 2024 Wizard/Evoker has Potent Cantrip but not yet Sculpt Spells; a L3 2014 Wizard has the reverse", () => {
  it("proves the swapped level gates reach a serialized character", async () => {
    const featureRows = await loadDbFeatureRows("wizard", "school of evocation");
    const profBonus = proficiencyBonusForLevel(3);

    const info2024 = deriveResources("wizard", "school of evocation", 3, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));
    expect(names2024.has("Potent Cantrip")).toBe(true);
    expect(names2024.has("Sculpt Spells")).toBe(false);

    const info2014 = deriveResources("wizard", "school of evocation", 3, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    expect(names2014.has("Sculpt Spells")).toBe(true);
    expect(names2014.has("Potent Cantrip")).toBe(false);
  });

  it("by L6 both editions have caught up to BOTH features (the gates fully overlap by then)", async () => {
    const featureRows = await loadDbFeatureRows("wizard", "school of evocation");
    const profBonus = proficiencyBonusForLevel(6);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const info = deriveResources("wizard", "school of evocation", 6, ABILITY_SCORES, profBonus, featureRows, edition);
      const names = new Set((info?.features ?? []).map((f) => f.name));
      expect(names.has("Potent Cantrip"), edition).toBe(true);
      expect(names.has("Sculpt Spells"), edition).toBe(true);
    }
  });
});

describe("integration (#1234): a L3 2024 Evoker has Potent Cantrip; the same call at L2 has zero subclass features", () => {
  it("pins the retained 2024 gate floor of 3 against the correctly-levelled rows", async () => {
    const featureRows = await loadDbFeatureRows("wizard", "school of evocation");

    const at3 = deriveResources("wizard", "school of evocation", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");
    expect((at3?.features ?? []).some((f) => f.name === "Potent Cantrip")).toBe(true);

    const at2 = deriveResources("wizard", "school of evocation", 2, ABILITY_SCORES, proficiencyBonusForLevel(2), featureRows, "EDITION_2024");
    expect((at2?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
  });
});

describe("wizard-2014-snapshot.test.ts must pass unmodified alongside this commit's changes", () => {
  it("the 2014 base-class row count is unaffected (still 4)", () => {
    expect(WIZARD_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2014")).toHaveLength(4);
  });
});
