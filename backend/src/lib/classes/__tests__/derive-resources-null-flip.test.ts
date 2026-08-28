import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { BATTLE_MASTER_ROWS } from "./test-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10,
};

// actionOnly rows are excluded from features but not from choices.
const ACTION_ONLY_CHOICE_ROW: ClassFeatureRow = {
  name: "Hunter's Prey",
  level: 3,
  description: "test",
  edition: "EDITION_2024",
  actionOnly: true,
  choiceKey: "huntersPrey",
  choiceCatalogSource: "huntersPrey",
  choiceCountTiers: [{ minLevel: 3, count: 1 }],
};

describe("deriveResources computes subclass extras/choices BEFORE the null check (#1524 null-flip fix)", () => {
  it("Ranger/Hunter L3 with ONLY a row-driven subclassChoice (no resourceFn pools, no non-actionOnly features) still derives subclassChoices — the real regression this fix closes", () => {
    const info = deriveResources(
      "ranger",
      "hunter",
      3,
      ABILITY_SCORES,
      proficiencyBonusForLevel(3),
      { classRows: [], subclassRows: [ACTION_ONLY_CHOICE_ROW] },
      "EDITION_2024",
    );
    expect(info).not.toBeNull();
    expect(info?.subclassChoices).toEqual([{ key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 }]);
    // Confirms this isn't a false pass from features/resources smuggling content back in.
    expect(info?.features).toEqual([]);
    expect(info?.resources).toEqual([]);
  });

  it("a genuinely empty class (unknown name, no subclass, no carrier) still returns null — the guard isn't disabled, just reordered", () => {
    const info = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(info).toBeNull();
  });
});

// resolveArcaneRecoveryContext and loadResourcesReconcileState's callers are
// module-private, so their exact null-safe expressions are pinned here
// literally rather than imported.
describe("the exact null-safe expressions resolveArcaneRecoveryContext / loadResourcesReconcileState's callers use", () => {
  it("Boolean(nullDerived?.resources.some(...)) is false, never throws", () => {
    const nullDerived = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(() => Boolean(nullDerived?.resources.some((r) => r.key === "arcaneRecovery"))).not.toThrow();
    expect(Boolean(nullDerived?.resources.some((r) => r.key === "arcaneRecovery"))).toBe(false);
  });

  it("nullDerived?.maneuverChoiceCount ?? 0 / ?.toolProfChoiceCount ?? 0 are both 0, never throw", () => {
    const nullDerived = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(nullDerived?.maneuverChoiceCount ?? 0).toBe(0);
    expect(nullDerived?.toolProfChoiceCount ?? 0).toBe(0);
  });
});

// #1546 Part B-ii: an empty featureRows carrier for a Battle Master fighter
// now trips deriveResources' null guard, since maneuverChoiceCount/
// toolProfChoiceCount/announcedSaveDC live only on the Combat
// Superiority/Student of War rows now — see derivedAt's comment in
// level-up-plan.ts for the level-up-plan consequence.
describe("#1546 Part B-ii: the featureRows carrier can flip a Battle Master's result between null and non-null", () => {
  it("an EMPTY carrier for a Battle Master fighter now returns null — nothing left to contribute without rows", () => {
    const info = deriveResources("fighter", "battle master", 5, ABILITY_SCORES, proficiencyBonusForLevel(5), { classRows: [], subclassRows: [] }, "EDITION_2024");
    expect(info).toBeNull();
  });

  it("the SAME call with the real Combat Superiority/Student of War rows attached flips to non-null, maneuver count/DC populated", () => {
    const info = deriveResources(
      "fighter",
      "battle master",
      5,
      ABILITY_SCORES,
      proficiencyBonusForLevel(5),
      { classRows: [], subclassRows: BATTLE_MASTER_ROWS },
      "EDITION_2024",
    );
    expect(info).not.toBeNull();
    expect(info?.maneuverChoiceCount).toBe(3); // gained at 3, no tier crossed again before 7
    expect(info?.toolProfChoiceCount).toBe(1);
    expect(typeof info?.announcedSaveDC).toBe("number");
    expect(info?.resources.map((r) => r.key)).toContain("superiorityDice");
  });
});
