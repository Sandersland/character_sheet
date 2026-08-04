// #1233 commit 3, migrated onto its row by #1685: Dark One's Own Luck's 2024
// total is the Charisma modifier (minimum of once) — now a
// `{ abilityMod: "charisma", min: 1 }` formula tier on the row itself
// (warlock-features.ts), evaluated by evaluateResourceTotal
// (class-feature-rows.ts); lib/classes/warlock.ts no longer has a resourceFn
// at all. Proves the real end-to-end path (deriveResources, not a bare
// poolsFromRows call) resolves the Cha-mod floor correctly and is
// edition-gated (flat 1 under 2014 regardless of Charisma).
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const BASE_SCORES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

function poolAt(charisma: number, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  const abilityScores = { ...BASE_SCORES, charisma };
  const info = deriveResources(
    "warlock",
    "the fiend",
    level,
    abilityScores,
    proficiencyBonusForLevel(level),
    testFeatureRowsFor("warlock", "the fiend"),
    edition,
  );
  return info?.resources.filter((r) => r.key === "darkOnesOwnLuck") ?? [];
}

describe("Dark One's Own Luck through deriveResources (#1233): the Charisma-modifier floor, end to end", () => {
  it("EDITION_2024, Cha 20 (+5 mod), level 6: total is 5", () => {
    const pools = poolAt(20, 6, "EDITION_2024");
    expect(pools).toHaveLength(1);
    expect(pools[0].total).toBe(5);
    expect(pools[0].recharge).toBe("longRest");
  });

  it("EDITION_2024, Cha 8 (-1 mod), level 6: total floors at 1, never goes negative", () => {
    const pools = poolAt(8, 6, "EDITION_2024");
    expect(pools).toHaveLength(1);
    expect(pools[0].total).toBe(1);
  });

  it("EDITION_2014, Cha 20, level 6: total is a flat 1 regardless of Charisma (2014's formula-free row)", () => {
    const pools = poolAt(20, 6, "EDITION_2014");
    expect(pools).toHaveLength(1);
    expect(pools[0].total).toBe(1);
    expect(pools[0].recharge).toBe("short-or-long");
  });

  it("never double-emits: exactly one darkOnesOwnLuck pool per edition, never two (row + resourceFn both firing)", () => {
    expect(poolAt(16, 6, "EDITION_2024")).toHaveLength(1);
    expect(poolAt(16, 6, "EDITION_2014")).toHaveLength(1);
  });

  it("absent below level 6 in both editions", () => {
    expect(poolAt(20, 5, "EDITION_2024")).toHaveLength(0);
    expect(poolAt(20, 5, "EDITION_2014")).toHaveLength(0);
  });
});
