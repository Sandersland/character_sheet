// #1231 commit 2 of 4: Rogue's real SRD 5.2 (2024) content. Every assertion
// below is pinned against an actual SRD 5.2 / PHB'24 VALUE (a duration, a DC
// formula, a level, a specific term) transcribed from the researched delta
// list — never against "differs from the 2014 row", which a garbage 2024
// paraphrase would also satisfy. Mirrors barbarian-2024-content.test.ts's
// shape (same file, same ROGUE_FEATURES export) but pins Rogue's own deltas,
// plus the same-name-fork structural check Infiltration Expertise exists to
// prove (absorbing Impostor, never a phantom feature name).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { ROGUE_FEATURES } from "../rogue-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return ROGUE_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const ARCANE_TRICKSTER = "rogue-arcane-trickster";
const ASSASSIN = "rogue-assassin";
const THIEF = "rogue-thief";

describe("Reliable Talent (#1231): 2024 level-shifts 11 -> 7", () => {
  it("2024 grants Reliable Talent at level 7 — a stale copy would still say 11", () => {
    expect(row(BASE, "Reliable Talent", "EDITION_2024").level).toBe(7);
  });

  it("2014 mirror: Reliable Talent stays at level 11 (catches an author 'fixing' the 2014 row)", () => {
    expect(row(BASE, "Reliable Talent", "EDITION_2014").level).toBe(11);
  });
});

describe("Blindsense (#1231): removed in 2024, no successor authored", () => {
  it("has no EDITION_2024 row", () => {
    expect(hasRow(BASE, "Blindsense", "EDITION_2024")).toBe(false);
  });

  it("keeps its EDITION_2014 row at level 14", () => {
    expect(row(BASE, "Blindsense", "EDITION_2014").level).toBe(14);
  });
});

describe("2024-only base rows exist at the right levels with no 2014 twin (#1231)", () => {
  it.each([
    ["Weapon Mastery", 1],
    ["Steady Aim", 3],
    ["Cunning Strike", 5],
    ["Improved Cunning Strike", 11],
    ["Devious Strikes", 14],
    ["Epic Boon", 19],
  ])("%s at level %i is 2024-only", (name, level) => {
    const r2024 = row(BASE, name, "EDITION_2024");
    expect(r2024.level).toBe(level);
    expect(hasRow(BASE, name, "EDITION_2014")).toBe(false);
  });
});

describe("Slippery Mind (#1231): 2024 adds Charisma alongside Wisdom", () => {
  it("2024 grants both Wisdom and Charisma save proficiency", () => {
    expect(row(BASE, "Slippery Mind", "EDITION_2024").description).toContain("Charisma");
  });

  it("2014 grants only Wisdom", () => {
    const r2014 = row(BASE, "Slippery Mind", "EDITION_2014");
    expect(r2014.description).toContain("Wisdom");
    expect(r2014.description).not.toContain("Charisma");
  });
});

describe("Stroke of Luck (#1231): 2024 broadens to any failed D20 Test, drops the miss-to-hit clause", () => {
  it("2024 contains 'D20 Test' and not the 2014 miss-to-hit phrasing", () => {
    const r2024 = row(BASE, "Stroke of Luck", "EDITION_2024");
    expect(r2024.description).toContain("D20 Test");
    expect(r2024.description).not.toContain("turn the miss into a hit");
  });

  it("2014 keeps the miss-to-hit phrasing and never mentions D20 Test", () => {
    const r2014 = row(BASE, "Stroke of Luck", "EDITION_2014");
    expect(r2014.description).toContain("turn the miss into a hit");
    expect(r2014.description).not.toContain("D20 Test");
  });
});

describe("Thieves' Cant (#1231): 2024 grants one other language", () => {
  it("2024 contains 'one other language'", () => {
    expect(row(BASE, "Thieves' Cant", "EDITION_2024").description).toContain("one other language");
  });
});

describe("Sneak Attack (#1231): 2024 restates the Advantage/Finesse-or-Ranged requirement and the tightened ally clause", () => {
  it("2024 requires Advantage AND a Finesse or Ranged weapon, and states the ally/Disadvantage carve-out", () => {
    const r2024 = row(BASE, "Sneak Attack", "EDITION_2024");
    expect(r2024.description).toContain("Advantage");
    expect(r2024.description).toContain("Finesse or a Ranged weapon");
    expect(r2024.description).toContain("Incapacitated");
    expect(r2024.description).toContain("Disadvantage");
  });
});

describe("Evasion (#1231): 2024 adds the Incapacitated carve-out", () => {
  it("2024 states you can't use it while Incapacitated", () => {
    expect(row(BASE, "Evasion", "EDITION_2024").description).toContain("Incapacitated");
  });

  it("2014 has no such carve-out", () => {
    expect(row(BASE, "Evasion", "EDITION_2014").description).not.toContain("Incapacitated");
  });
});

describe("Expertise (#1231): 2024 drops the Thieves' Tools alternative", () => {
  it("2024 grants two SKILL proficiencies only, +2 more at level 6", () => {
    const r2024 = row(BASE, "Expertise", "EDITION_2024");
    expect(r2024.description).not.toContain("Thieves' Tools");
    expect(r2024.description).toContain("level 6");
  });
});

describe("structural: no two rows share (subclassSlug, name, edition)", () => {
  it("every (subclassSlug, name, edition) triple is unique", () => {
    const keys = ROGUE_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Use Magic Device (#1231, Thief): 2024 rewrites into Attunement/Charges/Scrolls", () => {
  it("2024 caps attunement at four and names Spell Scroll explicitly", () => {
    const r2024 = row(THIEF, "Use Magic Device", "EDITION_2024");
    expect(r2024.description).toContain("four");
    expect(r2024.description).toContain("Spell Scroll");
  });
});

describe("Assassinate (#1231, Assassin): 2024 drops the auto-crit, adds Rogue-level extra damage", () => {
  it("2024 never mentions a critical hit and grants damage equal to your Rogue level", () => {
    const r2024 = row(ASSASSIN, "Assassinate", "EDITION_2024");
    expect(r2024.description).not.toContain("critical hit");
    expect(r2024.description).toContain("equal to your Rogue level");
  });

  it("2014 kept the auto-crit clause", () => {
    expect(row(ASSASSIN, "Assassinate", "EDITION_2014").description).toContain("critical hit");
  });
});

describe("Assassin (#1231): Bonus Proficiencies and Impostor get no 2024 successor under their own name", () => {
  it("Bonus Proficiencies has no EDITION_2024 row (renamed to Assassin's Tools)", () => {
    expect(hasRow(ASSASSIN, "Bonus Proficiencies", "EDITION_2024")).toBe(false);
  });

  it("Impostor has no EDITION_2024 row (absorbed into Infiltration Expertise's fork)", () => {
    expect(hasRow(ASSASSIN, "Impostor", "EDITION_2024")).toBe(false);
  });

  it("Assassin's Tools is 2024-only, at level 3", () => {
    expect(row(ASSASSIN, "Assassin's Tools", "EDITION_2024").level).toBe(3);
    expect(hasRow(ASSASSIN, "Assassin's Tools", "EDITION_2014")).toBe(false);
  });

  it("Envenom Weapons is 2024-only, at level 13 (fills Impostor's vacated slot)", () => {
    expect(row(ASSASSIN, "Envenom Weapons", "EDITION_2024").level).toBe(13);
    expect(hasRow(ASSASSIN, "Envenom Weapons", "EDITION_2014")).toBe(false);
  });
});

describe("Infiltration Expertise (#1231, Assassin): a SAME-NAME FORK, not a remove-plus-add", () => {
  it("2024 keeps the name and contains both 'Roving Aim' and 'Masterful Mimicry'", () => {
    const r2024 = row(ASSASSIN, "Infiltration Expertise", "EDITION_2024");
    expect(r2024.description).toContain("Roving Aim");
    expect(r2024.description).toContain("Masterful Mimicry");
  });

  it("2014's own text (the false-identity ritual) survives unchanged", () => {
    const r2014 = row(ASSASSIN, "Infiltration Expertise", "EDITION_2014");
    expect(r2014.description).toContain("false identity");
  });
});

describe("Death Strike (#1231, Assassin): 2024 drops the surprise requirement, gates to round 1", () => {
  it("2024 never mentions 'surprised' and requires a Sneak Attack hit on the first round", () => {
    const r2024 = row(ASSASSIN, "Death Strike", "EDITION_2024");
    expect(r2024.description).not.toContain("surprised");
    expect(r2024.description).toContain("first round");
  });

  it("2014 requires a surprised target", () => {
    expect(row(ASSASSIN, "Death Strike", "EDITION_2014").description).toContain("surprised");
  });
});

describe("Spell Thief (#1231, Arcane Trickster): 2024's Intelligence save + prepared-for-8-hours rework", () => {
  it("2024 contains 'Intelligence saving throw' and 'prepared'", () => {
    const r2024 = row(ARCANE_TRICKSTER, "Spell Thief", "EDITION_2024");
    expect(r2024.description).toContain("Intelligence saving throw");
    expect(r2024.description).toContain("prepared");
  });
});

describe("Versatile Trickster (#1231, Arcane Trickster): the corrected text — Trip option, no free Advantage", () => {
  it("2024 contains 'Trip option' and never the fabricated 'advantage on the next attack roll' text", () => {
    const r2024 = row(ARCANE_TRICKSTER, "Versatile Trickster", "EDITION_2024");
    expect(r2024.description).toContain("Trip option");
    expect(r2024.description).not.toContain("advantage on the next attack roll");
  });
});

describe("Second-Story Work (#1231, Thief): the corrected text — Climb Speed, Dex-for-jump, no added modifier", () => {
  it("2024 contains 'Climb Speed' and never the 2014 '+Dex mod to running jumps' phrasing", () => {
    const r2024 = row(THIEF, "Second-Story Work", "EDITION_2024");
    expect(r2024.description).toContain("Climb Speed");
    expect(r2024.description).not.toContain("extra movement");
  });
});

describe("Thief's Reflexes (#1231, Thief): 2024 drops the surprised clause", () => {
  it("2024 never mentions 'surprised'", () => {
    expect(row(THIEF, "Thief's Reflexes", "EDITION_2024").description).not.toContain("surprised");
  });

  it("2014 keeps the surprised clause", () => {
    expect(row(THIEF, "Thief's Reflexes", "EDITION_2014").description).toContain("surprised");
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 10,
};

// Integration-level proof (mirrors feature-edition.test.ts's/
// barbarian-2024-content.test.ts's loadDbFeatureRows pattern): the REAL
// seeded rows, read through the REAL derivation path, actually reach a
// serialized character's derived features — not just ROGUE_FEATURES'
// in-memory shape.
describe("integration (#1231): a level-14 Rogue's derived features differ by edition exactly where authored", () => {
  it("2024 has Steady Aim/Cunning Strike/Improved Cunning Strike/Devious Strikes and NOT Blindsense; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("rogue", undefined);
    const profBonus = proficiencyBonusForLevel(14);

    const info2014 = deriveResources("rogue", undefined, 14, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("rogue", undefined, 14, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Blindsense")).toBe(true);
    expect(names2014.has("Steady Aim")).toBe(false);
    expect(names2014.has("Cunning Strike")).toBe(false);
    expect(names2014.has("Improved Cunning Strike")).toBe(false);
    expect(names2014.has("Devious Strikes")).toBe(false);

    expect(names2024.has("Blindsense")).toBe(false);
    expect(names2024.has("Steady Aim")).toBe(true);
    expect(names2024.has("Cunning Strike")).toBe(true);
    expect(names2024.has("Improved Cunning Strike")).toBe(true);
    expect(names2024.has("Devious Strikes")).toBe(true);
  });
});
