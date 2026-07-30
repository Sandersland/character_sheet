import { describe, expect, it } from "vitest";

import { deriveFeatBonuses, featOfferedForAsiSlot, type FeatCategory } from "@/lib/srd/feats.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { RulesEdition } from "@character-sheet/shared-types";

const E2024 = "EDITION_2024" as const;

// PHB'24 pp. 87-88: ASI slots offer General (level 4+) and Epic Boon (level 19+)
// feats only; Origin feats come from backgrounds and Fighting Style from class.
describe("featOfferedForAsiSlot", () => {
  it("never offers Origin feats", () => {
    expect(featOfferedForAsiSlot({ category: "origin", levelPrerequisite: null }, 1, E2024)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "origin", levelPrerequisite: null }, 20, E2024)).toBe(false);
  });

  it("never offers Fighting Style feats via an ASI slot", () => {
    expect(featOfferedForAsiSlot({ category: "fighting_style", levelPrerequisite: null }, 20, E2024)).toBe(false);
  });

  it("offers General feats at level >= 4 (default prerequisite)", () => {
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: null }, 3, E2024)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: null }, 4, E2024)).toBe(true);
  });

  it("honours an explicit General levelPrerequisite override", () => {
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: 8 }, 7, E2024)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "general", levelPrerequisite: 8 }, 8, E2024)).toBe(true);
  });

  it("offers Epic Boon feats only at level >= 19 (default prerequisite)", () => {
    expect(featOfferedForAsiSlot({ category: "epic_boon", levelPrerequisite: null }, 18, E2024)).toBe(false);
    expect(featOfferedForAsiSlot({ category: "epic_boon", levelPrerequisite: null }, 19, E2024)).toBe(true);
  });

  it("fails safe-closed for an unknown future category", () => {
    // A category added to the DB enum but not to the switch must never leak feats.
    expect(featOfferedForAsiSlot({ category: "mystery" as never, levelPrerequisite: null }, 20, E2024)).toBe(false);
  });

  // #1438 threaded `edition` purely as the seam #1310 will fill; until then an
  // accidental fork is a silent per-edition picker divergence with no other
  // symptom, so pin every (category, level) verdict equal across both editions.
  it("returns the same verdict in both editions for every category at every level", () => {
    const categories: FeatCategory[] = ["origin", "general", "fighting_style", "epic_boon"];
    const editions: RulesEdition[] = ["EDITION_2014", "EDITION_2024"];
    for (const category of categories) {
      for (let level = 1; level <= 20; level += 1) {
        const [v2014, v2024] = editions.map((edition) =>
          featOfferedForAsiSlot({ category, levelPrerequisite: null }, level, edition),
        );
        expect(v2014, `${category} @ ${level}`).toBe(v2024);
      }
    }
  });
});

// PHB'24: Alert's initiative bonus scales with Proficiency Bonus rather than a
// flat +5 — modeled via FeatImprovement.scaling = "proficiencyBonus".
describe("deriveFeatBonuses — proficiencyBonus scaling", () => {
  const entry = (): AdvancementEntry => ({
    id: "e1",
    level: 4,
    kind: "feat",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    improvements: [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }],
  });

  it("multiplies the amount by the proficiency bonus at the applied level", () => {
    expect(deriveFeatBonuses([entry()], 4).initiative).toBe(2); // PB +2 at level 4
    expect(deriveFeatBonuses([entry()], 5).initiative).toBe(3); // PB +3 at level 5
    expect(deriveFeatBonuses([entry()], 17).initiative).toBe(6); // PB +6 at level 17
  });
});
