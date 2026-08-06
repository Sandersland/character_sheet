// #1230 commit 3, migrated onto their rows by #1685: Tireless's/Nature's
// Veil's total is the Wisdom modifier (minimum of once) — now a
// `{ abilityMod: "wisdom", min: 1 }` formula tier on each row
// (ranger-features.ts), evaluated by evaluateResourceTotal
// (class-feature-rows.ts); lib/classes/ranger.ts no longer has a resourceFn
// for either. Proves the real end-to-end path (deriveResources, not a bare
// poolsFromRows call) resolves the Wis-mod floor correctly and is level- and
// edition-gated. Modelled on warlock-dark-ones-own-luck.test.ts.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const BASE_SCORES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

function poolsAt(wisdom: number, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  const abilityScores = { ...BASE_SCORES, wisdom };
  const info = deriveResources(
    "ranger",
    undefined,
    level,
    abilityScores,
    proficiencyBonusForLevel(level),
    testFeatureRowsFor("ranger", undefined),
    edition,
  );
  return info?.resources ?? [];
}

function poolAt(key: string, wisdom: number, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsAt(wisdom, level, edition).find((r) => r.key === key);
}

describe("Tireless through deriveResources (#1230 C1): the Wisdom-modifier floor, end to end", () => {
  it("absent below level 10", () => {
    expect(poolAt("tireless", 18, 9, "EDITION_2024")).toBeUndefined();
  });

  it("Wis 8 (-1 mod), level 10: total floors at 1, never goes negative", () => {
    expect(poolAt("tireless", 8, 10, "EDITION_2024")?.total).toBe(1);
  });

  it("Wis 18 (+4 mod), level 10: total is 4", () => {
    expect(poolAt("tireless", 18, 10, "EDITION_2024")?.total).toBe(4);
  });

  it("recharge is longRest", () => {
    expect(poolAt("tireless", 18, 10, "EDITION_2024")?.recharge).toBe("longRest");
  });

  it("absent entirely under EDITION_2014", () => {
    expect(poolAt("tireless", 18, 20, "EDITION_2014")).toBeUndefined();
  });
});

describe("Nature's Veil through deriveResources (#1230 C1): the Wisdom-modifier floor, end to end", () => {
  it("absent below level 14", () => {
    expect(poolAt("naturesVeil", 18, 13, "EDITION_2024")).toBeUndefined();
  });

  it("present at level 14, Wis 18 (+4 mod): total is 4", () => {
    expect(poolAt("naturesVeil", 18, 14, "EDITION_2024")?.total).toBe(4);
  });

  it("Wis 8 (-1 mod), level 14: total floors at 1", () => {
    expect(poolAt("naturesVeil", 8, 14, "EDITION_2024")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2014", () => {
    expect(poolAt("naturesVeil", 18, 20, "EDITION_2014")).toBeUndefined();
  });
});

describe("never double-emits: exactly one of each pool per edition/level, never two (row + resourceFn both firing)", () => {
  it("at level 20 under EDITION_2024, tireless/naturesVeil/favoredEnemy each appear exactly once", () => {
    const pools = poolsAt(16, 20, "EDITION_2024");
    for (const key of ["tireless", "naturesVeil", "favoredEnemy"]) {
      expect(pools.filter((r) => r.key === key), key).toHaveLength(1);
    }
  });
});

// #1685 KNOWN, ACCEPTED CONSEQUENCE: before this migration, mergePoolSources
// (registry.ts) put Tireless/Nature's Veil FIRST (they arrived via
// resourceFn) ahead of the row-sourced Favored Enemy. Now all three arrive
// via poolsFromRows, in the rows' own level-ascending authoring order
// (Favored Enemy L1, Tireless L10, Nature's Veil L14) — the array POSITION of
// `resources` shifted (pinned by class-features-snapshot.test.ts's updated
// snapshot); no pool's key/label/total/recharge/description changed. This
// test asserts the set is unaffected by the reorder, independent of position.
describe("#1685 order-change disclosure: reordering the base layer's resources array changes no pool's own values", () => {
  it("the base pools at level 20 (favoredEnemy/tireless/naturesVeil) carry the same totals regardless of array position", () => {
    const pools = poolsAt(18, 20, "EDITION_2024");
    const byKey = Object.fromEntries(pools.map((p) => [p.key, p]));
    expect(byKey.favoredEnemy?.total).toBe(6);
    expect(byKey.tireless?.total).toBe(4);
    expect(byKey.naturesVeil?.total).toBe(4);
  });
});
