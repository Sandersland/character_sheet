// Rogue Thief (#909): content-only subclass — features derive at PHB levels,
// no new pool. REWRITTEN for #1231 commit 4: `lib/classes/rogue.ts` is
// deleted, so `testFeatureRowsFor("rogue", "thief")` (test-feature-rows.fixture.ts)
// now yields an EMPTY carrier (`classRows: [], subclassRows: []`) and
// `deriveResources` returns `null` for it — Rogue is no longer in
// TEST_CLASSES/TEST_SUBCLASSES at all. This file goes DB-backed instead
// (`loadDbFeatureRows`, mirroring fighter-unregistered.test.ts's own
// post-deletion shape) so it exercises the REAL seeded rows, not a TS
// fixture mirror. Every expected name/level pinned below is UNCHANGED from
// before this rewrite — 2024's Thief rows keep the same five names at the
// same five levels (#1231 commit 2 reworded the TEXT, never a level).
import { describe, expect, it } from "vitest";

import { deriveEntryScopedActions } from "@/lib/classes/actions.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITIES = {
  strength: 10,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 10,
};

async function thiefFeatureNames(level: number): Promise<string[]> {
  const featureRows = await loadDbFeatureRows("rogue", "thief");
  const info = deriveResources("rogue", "thief", level, ABILITIES, proficiencyBonusForLevel(level), featureRows, "EDITION_2024");
  return (info?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
}

describe("Rogue Thief subclass (#909)", () => {
  it("is selectable — deriveResources returns Thief features once granted", async () => {
    expect(await thiefFeatureNames(3)).toContain("Fast Hands");
  });

  it("grants nothing below the level-3 grant level", async () => {
    expect(await thiefFeatureNames(1)).toEqual([]);
    expect(await thiefFeatureNames(2)).toEqual([]);
  });

  it("derives each feature at its PHB level", async () => {
    expect(await thiefFeatureNames(3)).toEqual(["Fast Hands", "Second-Story Work"]);
    expect(await thiefFeatureNames(8)).toEqual(["Fast Hands", "Second-Story Work"]);
    expect(await thiefFeatureNames(9)).toContain("Supreme Sneak");
    expect(await thiefFeatureNames(12)).not.toContain("Use Magic Device");
    expect(await thiefFeatureNames(13)).toContain("Use Magic Device");
    expect(await thiefFeatureNames(16)).not.toContain("Thief's Reflexes");
    expect(await thiefFeatureNames(17)).toContain("Thief's Reflexes");
  });

  it("has all five features at level 17", async () => {
    expect(await thiefFeatureNames(17)).toEqual([
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
  // deriveEntryScopedActions is data-gated (actions.ts), not TS-class-gated,
  // so it needed no edit for #1231's deletion of rogue.ts.
  it("Fast Hands is both a rogue-features.ts prose row and a bonus-action row (#1431)", async () => {
    expect(await thiefFeatureNames(3)).toContain("Fast Hands");
    const actions = deriveEntryScopedActions([{ name: "rogue", subclass: "Thief", level: 3 }], 3, [], true, "EDITION_2024");
    const row = actions.find((a) => a.key === "fastHands");
    expect(row?.name).toBe("Fast Hands");
    expect(row?.cost).toBe("bonusAction");
    expect(row?.regrants).toEqual(["useObject"]);
  });

  it("adds no trackable resource pool (content-only, no new level-gated axis)", async () => {
    const info = deriveResources("rogue", "thief", 17, ABILITIES, proficiencyBonusForLevel(17), await loadDbFeatureRows("rogue", "thief"), "EDITION_2024");
    const base = deriveResources("rogue", undefined, 17, ABILITIES, proficiencyBonusForLevel(17), await loadDbFeatureRows("rogue", undefined), "EDITION_2024");
    expect(info?.resources).toEqual(base?.resources);
  });
});
