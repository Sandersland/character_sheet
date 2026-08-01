// #1223 commit 2 of 3: Barbarian's real SRD 5.2 (2024) content. Every
// assertion below is pinned against an actual SRD 5.2 VALUE (a duration, a DC
// formula, a level, a maximum) transcribed from the researched delta list —
// never against "differs from the 2014 row", which a garbage 2024 paraphrase
// would also satisfy. Mirrors barbarian-2014-snapshot.test.ts's shape (same
// file, same BARBARIAN_FEATURES export) but pins the OTHER edition, plus the
// structural collision this issue's own Improved Brutal Strike row exists to
// avoid (see BARBARIAN_FEATURES' own comment on that row).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { BARBARIAN_FEATURES } from "../barbarian-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return BARBARIAN_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
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
const BERSERKER = "barbarian-berserker";
const TOTEM_WARRIOR = "barbarian-totem-warrior";

describe("Rage (#1223): 2024 is the rewritten bonus-action/duration/extension form", () => {
  it("2024 carries the until-end-of-next-turn duration, all three extension triggers, the Heavy-armor bar, and the 10-minute cap", () => {
    const r2024 = row(BASE, "Rage", "EDITION_2024");
    expect(r2024.description).toContain("until the end of your next turn");
    expect(r2024.description).toContain("attack roll");
    expect(r2024.description).toContain("saving throw");
    expect(r2024.description).toContain("Bonus Action to extend");
    expect(r2024.description).toContain("Heavy armor");
    expect(r2024.description).toContain("10 minutes");
  });

  it("2014 carries none of the 2024 duration/extension text", () => {
    const r2014 = row(BASE, "Rage", "EDITION_2014");
    expect(r2014.description).not.toContain("end of your next turn");
    expect(r2014.description).not.toContain("10 minutes");
    expect(r2014.description).not.toContain("Heavy armor");
  });
});

describe("Danger Sense (#1223): 2024 drops the 'effects you can see' restriction for an unless-Incapacitated form", () => {
  it("2024 is unless-Incapacitated and never mentions effects you can see", () => {
    const r2024 = row(BASE, "Danger Sense", "EDITION_2024");
    expect(r2024.description).toContain("unless you have the Incapacitated condition");
    expect(r2024.description).not.toContain("effects that you can see");
  });

  it("2014 keeps the 'effects that you can see' restriction", () => {
    const r2014 = row(BASE, "Danger Sense", "EDITION_2014");
    expect(r2014.description).toContain("effects that you can see");
  });
});

describe("Reckless Attack (#1223): 2024 widens from melee-weapon Strength attacks to Strength attacks generally", () => {
  it("2024 grants Advantage on Strength attack rolls with no 'melee weapon' qualifier", () => {
    const r2024 = row(BASE, "Reckless Attack", "EDITION_2024");
    expect(r2024.description).toContain("attack rolls using Strength");
    expect(r2024.description).not.toContain("melee weapon");
  });

  it("2014 restricts the Advantage to melee weapon attack rolls", () => {
    const r2014 = row(BASE, "Reckless Attack", "EDITION_2014");
    expect(r2014.description).toContain("melee weapon attack rolls using Strength");
  });
});

describe("Feral Instinct (#1223): 2024 drops the surprise-negation clause", () => {
  it("2024 is Initiative Advantage only, no surprise clause", () => {
    const r2024 = row(BASE, "Feral Instinct", "EDITION_2024");
    expect(r2024.description).toContain("Advantage on Initiative");
    expect(r2024.description).not.toContain("surprised");
  });

  it("2014 keeps the surprise-negation clause", () => {
    const r2014 = row(BASE, "Feral Instinct", "EDITION_2014");
    expect(r2014.description).toContain("surprised");
  });
});

describe("Relentless Rage (#1223): 2024 sets HP to twice your Barbarian level, not 1 HP", () => {
  it("2024 restores HP to twice your Barbarian level", () => {
    const r2024 = row(BASE, "Relentless Rage", "EDITION_2024");
    expect(r2024.description).toContain("twice your Barbarian level");
  });

  it("2014 drops you to 1 HP instead", () => {
    const r2014 = row(BASE, "Relentless Rage", "EDITION_2014");
    expect(r2014.description).toContain("1 HP");
  });
});

describe("Primal Champion (#1223): 2024's maximum is 25, not 24", () => {
  it("2024 caps Strength/Constitution at 25", () => {
    const r2024 = row(BASE, "Primal Champion", "EDITION_2024");
    expect(r2024.description).toContain("25");
  });

  it("2014 caps at 24", () => {
    const r2014 = row(BASE, "Primal Champion", "EDITION_2014");
    expect(r2014.description).toContain("24");
  });
});

describe("Indomitable Might (#1223): 2024 also covers Strength saving throws", () => {
  it("2024 mentions Strength saving throw, not just Strength check", () => {
    const r2024 = row(BASE, "Indomitable Might", "EDITION_2024");
    expect(r2024.description).toContain("Strength check");
    expect(r2024.description).toContain("Strength saving throw");
  });

  it("2014 covers only the Strength check", () => {
    const r2014 = row(BASE, "Indomitable Might", "EDITION_2014");
    expect(r2014.description).not.toContain("saving throw");
  });
});

describe("Persistent Rage (#1223): 2024's regain-on-Initiative clause and Unconscious-not-Incapacitated end condition", () => {
  it("2024 carries the once-per-Long-Rest regain-all-on-Initiative clause and ends only on Unconscious", () => {
    const r2024 = row(BASE, "Persistent Rage", "EDITION_2024");
    expect(r2024.description).toContain("Initiative");
    expect(r2024.description).toContain("Long Rest");
    expect(r2024.description).toContain("Unconscious");
  });

  it("2014 has neither the Initiative regain nor an Unconscious-specific end condition", () => {
    const r2014 = row(BASE, "Persistent Rage", "EDITION_2014");
    expect(r2014.description).not.toContain("Initiative");
    expect(r2014.description).not.toContain("Unconscious");
  });
});

describe("2024-only rows exist at the right levels with no 2014 twin (#1223)", () => {
  it.each([
    ["Weapon Mastery", 1],
    ["Primal Knowledge", 3],
    ["Instinctive Pounce", 7],
    ["Brutal Strike", 9],
    ["Improved Brutal Strike", 13],
    ["Epic Boon", 19],
  ])("%s at level %i is 2024-only", (name, level) => {
    const r2024 = row(BASE, name, "EDITION_2024");
    expect(r2024.level).toBe(level);
    expect(hasRow(BASE, name, "EDITION_2014")).toBe(false);
  });
});

describe("Improved Brutal Strike (#1223): one row carries both the L13 and L17 tiers (unique-constraint collision)", () => {
  it("its text states both the Staggering/Sundering Blow grant AND the L17 2d10/two-effects upgrade", () => {
    const r = row(BASE, "Improved Brutal Strike", "EDITION_2024");
    expect(r.description).toContain("Staggering Blow");
    expect(r.description).toContain("Sundering Blow");
    expect(r.description).toContain("2d10");
    expect(r.description).toContain("level 17");
  });
});

describe("Brutal Critical (#1223): 2014-only, no 2024 successor", () => {
  it("exists at level 9 in EDITION_2014", () => {
    const r = row(BASE, "Brutal Critical", "EDITION_2014");
    expect(r.level).toBe(9);
  });

  it("has no EDITION_2024 row", () => {
    expect(hasRow(BASE, "Brutal Critical", "EDITION_2024")).toBe(false);
  });
});

describe("Path of the Totem Warrior (#1223): 5 EDITION_2014 rows, 0 EDITION_2024 rows", () => {
  it("counts exactly 5 / 0", () => {
    const totemRows = BARBARIAN_FEATURES.filter((r) => r.subclassSlug === TOTEM_WARRIOR);
    expect(totemRows.filter((r) => r.edition === "EDITION_2014")).toHaveLength(5);
    expect(totemRows.filter((r) => r.edition === "EDITION_2024")).toHaveLength(0);
  });
});

describe("Path of the Berserker (#1223): level shifts and rewrites", () => {
  it("Retaliation: level 14 in 2014, level 10 in 2024", () => {
    expect(row(BERSERKER, "Retaliation", "EDITION_2014").level).toBe(14);
    expect(row(BERSERKER, "Retaliation", "EDITION_2024").level).toBe(10);
  });

  it("Intimidating Presence: level 10 in 2014, level 14 in 2024", () => {
    expect(row(BERSERKER, "Intimidating Presence", "EDITION_2014").level).toBe(10);
    expect(row(BERSERKER, "Intimidating Presence", "EDITION_2024").level).toBe(14);
  });

  it("Intimidating Presence 2024's save DC is Strength-based (2014 is Charisma-based), a Bonus Action, 30-foot Emanation", () => {
    const r2024 = row(BERSERKER, "Intimidating Presence", "EDITION_2024");
    expect(r2024.description).toContain("Strength modifier");
    expect(r2024.description).not.toContain("Charisma");
    expect(r2024.description).toContain("Bonus Action");
    expect(r2024.description).toContain("30-foot Emanation");

    const r2014 = row(BERSERKER, "Intimidating Presence", "EDITION_2014");
    expect(r2014.description).toContain("Charisma");
  });

  it("Frenzy 2024 has no exhaustion and rolls d6s equal to the Rage Damage bonus", () => {
    const r2024 = row(BERSERKER, "Frenzy", "EDITION_2024");
    expect(r2024.description).not.toContain("exhaustion");
    expect(r2024.description).toContain("d6");
    expect(r2024.description).toContain("Rage Damage bonus");

    const r2014 = row(BERSERKER, "Frenzy", "EDITION_2014");
    expect(r2014.description).toContain("exhaustion");
  });

  it("Mindless Rage 2024 is Immunity, not merely suspension", () => {
    const r2024 = row(BERSERKER, "Mindless Rage", "EDITION_2024");
    expect(r2024.description).toContain("Immunity");

    const r2014 = row(BERSERKER, "Mindless Rage", "EDITION_2014");
    expect(r2014.description).not.toContain("Immunity");
  });
});

describe("Extra Attack stays edition-invariant on derivedStat (#1223 constraint 5)", () => {
  it("both editions' L5 rows keep attacksPerAction / minLevel 5 -> 2", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const r = row(BASE, "Extra Attack", edition);
      expect(r.derivedStat).toBe("attacksPerAction");
      expect(r.derivedStatTiers).toEqual([{ minLevel: 5, value: 2 }]);
    }
  });
});

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

// Integration-level proof (mirrors feature-edition.test.ts's
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived features —
// not just BARBARIAN_FEATURES' in-memory shape. Barbarian is an ordinary
// already-seeded class/no-subclass pair, so this needs no bespoke catalog row
// (unlike fighter-resource-rows.ts's precedent, which exists for a domain
// this commit doesn't touch — resource pools).
describe("integration (#1223): a level-13 Barbarian's derived features differ by edition exactly where authored", () => {
  it("2024 has Instinctive Pounce/Primal Knowledge/Brutal Strike/Improved Brutal Strike and NOT Brutal Critical; 2014 is the reverse", async () => {
    const featureRows = await loadDbFeatureRows("barbarian", undefined);
    const profBonus = proficiencyBonusForLevel(13);

    const info2014 = deriveResources("barbarian", undefined, 13, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const info2024 = deriveResources("barbarian", undefined, 13, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");

    const names2014 = new Set((info2014?.features ?? []).map((f) => f.name));
    const names2024 = new Set((info2024?.features ?? []).map((f) => f.name));

    expect(names2014.has("Brutal Critical")).toBe(true);
    expect(names2014.has("Instinctive Pounce")).toBe(false);
    expect(names2014.has("Primal Knowledge")).toBe(false);
    expect(names2014.has("Brutal Strike")).toBe(false);
    expect(names2014.has("Improved Brutal Strike")).toBe(false);

    expect(names2024.has("Brutal Critical")).toBe(false);
    expect(names2024.has("Instinctive Pounce")).toBe(true);
    expect(names2024.has("Primal Knowledge")).toBe(true);
    expect(names2024.has("Brutal Strike")).toBe(true);
    expect(names2024.has("Improved Brutal Strike")).toBe(true);
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = BARBARIAN_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
