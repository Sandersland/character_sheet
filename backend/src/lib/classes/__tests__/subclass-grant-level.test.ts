// 2024 rules: every class chooses its subclass at level 3 (#1128) — no subclass
// feature or pool derives below level 3. The cross-source invariant that the
// class-definition grantLevel matches the seed subclassLevel lives with the seed
// structural checks (seed-data.test.ts), which can import the seed catalog.
import { describe, it, expect } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const ABILITIES = { strength: 10, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 16, charisma: 16 };

function subclassFeatures(className: string, subclass: string, level: number) {
  const info = deriveResources(className, subclass, level, ABILITIES, proficiencyBonusForLevel(level));
  return (info?.features ?? []).filter((f) => f.source === "subclass");
}

// One representative subclass per class whose subclass grant moved to 3.
const MOVED: Array<[string, string]> = [
  ["cleric", "life domain"],
  ["sorcerer", "draconic bloodline"],
  ["warlock", "the archfey"],
  ["wizard", "school of evocation"],
  ["druid", "circle of the moon"],
];

describe("subclass grant level is 3 for all classes (#1128)", () => {
  it.each(MOVED)("%s / %s contributes no subclass features at level 2", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 2)).toEqual([]);
  });

  it.each(MOVED)("%s / %s contributes subclass features at level 3", (className, subclass) => {
    expect(subclassFeatures(className, subclass, 3).length).toBeGreaterThan(0);
  });

  it("Archfey's feyPresence pool is absent at level 2 and present at level 3", () => {
    const at = (level: number) =>
      deriveResources("warlock", "the archfey", level, ABILITIES, proficiencyBonusForLevel(level))
        ?.resources.some((r) => r.key === "feyPresence") ?? false;
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });

  // The lowest domain/patron spell tier now grants at level 3, so no cleric or
  // warlock subclass feature description may still label it "(L1)" (#1128).
  const L1_LABEL_SUBCLASSES: Array<[string, string]> = [
    ["cleric", "life domain"],
    ["cleric", "trickery domain"],
    ["warlock", "the fiend"],
    ["warlock", "the archfey"],
    ["warlock", "the great old one"],
  ];
  it.each(L1_LABEL_SUBCLASSES)("%s / %s has no feature description labelling a tier (L1)", (className, subclass) => {
    const info = deriveResources(className, subclass, 20, ABILITIES, proficiencyBonusForLevel(20));
    const withL1 = (info?.features ?? []).filter((f) => f.description.includes("(L1)")).map((f) => f.name);
    expect(withL1).toEqual([]);
  });
});
