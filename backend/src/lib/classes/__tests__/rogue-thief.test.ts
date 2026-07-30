// Rogue Thief (#909): content-only subclass — features derive at PHB levels, no new pool.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedActions } from "@/lib/classes/actions.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const ABILITIES = {
  strength: 10,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 10,
};

function thiefFeatureNames(level: number): string[] {
  const info = deriveResources("rogue", "thief", level, ABILITIES, proficiencyBonusForLevel(level), "EDITION_2024");
  return (info?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
}

describe("Rogue Thief subclass (#909)", () => {
  it("is selectable — deriveResources returns Thief features once granted", () => {
    expect(thiefFeatureNames(3)).toContain("Fast Hands");
  });

  it("grants nothing below the level-3 grant level", () => {
    expect(thiefFeatureNames(1)).toEqual([]);
    expect(thiefFeatureNames(2)).toEqual([]);
  });

  it("derives each feature at its PHB level", () => {
    expect(thiefFeatureNames(3)).toEqual(["Fast Hands", "Second-Story Work"]);
    expect(thiefFeatureNames(8)).toEqual(["Fast Hands", "Second-Story Work"]);
    expect(thiefFeatureNames(9)).toContain("Supreme Sneak");
    expect(thiefFeatureNames(12)).not.toContain("Use Magic Device");
    expect(thiefFeatureNames(13)).toContain("Use Magic Device");
    expect(thiefFeatureNames(16)).not.toContain("Thief's Reflexes");
    expect(thiefFeatureNames(17)).toContain("Thief's Reflexes");
  });

  it("has all five features at level 17", () => {
    expect(thiefFeatureNames(17)).toEqual([
      "Fast Hands",
      "Second-Story Work",
      "Supreme Sneak",
      "Use Magic Device",
      "Thief's Reflexes",
    ]);
  });

  // #1431 gave Fast Hands a DERIVED_ACTIONS row so the mechanic is data, not
  // only prose. The prose entry STAYS: it is the feature description the Class
  // tab renders, while the action row is the affordance the Bonus Action sheet
  // renders. Losing either half is a regression, so both are pinned together.
  it("Fast Hands is both a THIEF_FEATURES prose row and a bonus-action row (#1431)", () => {
    expect(thiefFeatureNames(3)).toContain("Fast Hands");
    const actions = deriveEntryScopedActions([{ name: "rogue", subclass: "Thief", level: 3 }], 3, [], true, "EDITION_2024");
    const row = actions.find((a) => a.key === "fastHands");
    expect(row?.name).toBe("Fast Hands");
    expect(row?.cost).toBe("bonusAction");
    expect(row?.regrants).toEqual(["useObject"]);
  });

  it("adds no trackable resource pool (content-only, no new level-gated axis)", () => {
    const info = deriveResources("rogue", "thief", 17, ABILITIES, proficiencyBonusForLevel(17), "EDITION_2024");
    const base = deriveResources("rogue", undefined, 17, ABILITIES, proficiencyBonusForLevel(17), "EDITION_2024");
    expect(info?.resources).toEqual(base?.resources);
  });
});
