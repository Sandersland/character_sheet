// Pure (no DB) test for expertiseChoiceCount derivation (#1588): a base-class
// feature row carrying a derivedStat: "expertiseChoiceCount" tier ladder
// derives the level-gated Expertise pick count through the SAME
// deriveEntryScopedResources -> deriveRowExtras -> derivedStatFromRows path
// maneuverChoiceCount/toolProfChoiceCount already use (CLAUDE.md's
// one-shared-function rule) — never a second inline copy.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources } from "@/lib/classes/class-features.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

const ABILITIES = {
  strength: 10,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 10,
  charisma: 14,
};

// Mirrors Rogue's real seed shape (Task 3): one base-class "Expertise" row
// carrying the whole tier ladder (PHB'14 p.96 / SRD 5.2: 2 skills at L1, 4 at L6).
const ROGUE_EXPERTISE_ROW: ClassFeatureRow = {
  name: "Expertise",
  level: 1,
  description: "Choose two of your skill proficiencies. Your proficiency bonus is doubled for those skills.",
  edition: "EDITION_2014",
  derivedStat: "expertiseChoiceCount",
  derivedStatTiers: [
    { minLevel: 1, value: 2 },
    { minLevel: 6, value: 4 },
  ],
};

// Mirrors Bard's real 2014 seed row (bard-features.ts): 2 skills at L3, 4 at L10.
const BARD_EXPERTISE_ROW: ClassFeatureRow = {
  name: "Expertise",
  level: 3,
  description: "Choose two of your skill proficiencies. Your proficiency bonus is doubled for those skills.",
  edition: "EDITION_2014",
  derivedStat: "expertiseChoiceCount",
  derivedStatTiers: [
    { minLevel: 3, value: 2 },
    { minLevel: 10, value: 4 },
  ],
};

function rogueEntriesAtLevel(level: number) {
  return [{ name: "rogue", subclass: undefined, level }];
}

function getRows(): ClassFeatureRowsCarrier {
  return { classRows: [ROGUE_EXPERTISE_ROW], subclassRows: [] };
}

// Per-entry row lookup for the multiclass test below — mirrors production's
// featureRowsOf, which resolves each class ENTRY's own rows independently.
function getRowsByClassName(entry: { name: string }): ClassFeatureRowsCarrier {
  const row = entry.name === "rogue" ? ROGUE_EXPERTISE_ROW : BARD_EXPERTISE_ROW;
  return { classRows: [row], subclassRows: [] };
}

describe("expertiseChoiceCount derivation (#1588)", () => {
  it("derives expertiseChoiceCount from a rogue Expertise row", () => {
    const { derived } = deriveEntryScopedResources(rogueEntriesAtLevel(1), 1, ABILITIES, 2, "EDITION_2014", getRows);
    expect(derived?.expertiseChoiceCount).toBe(2);

    const six = deriveEntryScopedResources(rogueEntriesAtLevel(6), 6, ABILITIES, 3, "EDITION_2014", getRows);
    expect(six.derived?.expertiseChoiceCount).toBe(4);
  });

  it("is undefined below the grant level and for a non-matching edition", () => {
    const belowGrant = deriveEntryScopedResources(rogueEntriesAtLevel(0), 0, ABILITIES, 2, "EDITION_2014", getRows);
    expect(belowGrant.derived).toBeNull();

    const wrongEdition = deriveEntryScopedResources(rogueEntriesAtLevel(1), 1, ABILITIES, 2, "EDITION_2024", getRows);
    expect(wrongEdition.derived?.expertiseChoiceCount).toBeUndefined();
  });

  // Regression for the multiclass clobber bug (Opus review, #1588): four
  // classes grant Expertise, so two grantor entries on ONE character is real
  // RAW territory, not a misconfiguration — overlayExtrasFields must SUM
  // expertiseChoiceCount across entries (like subclassChoices' concat), never
  // defined-wins overlay it (like maneuverChoiceCount/toolProfChoiceCount,
  // which stay single-source — Battle Master only — so overlay is safe there).
  it("SUMS expertiseChoiceCount across two grantor entries in a multiclass (Rogue 6 / Bard 3, 2014: 4 + 2 = 6)", () => {
    const entries = [
      { name: "rogue", subclass: undefined, level: 6 },
      { name: "bard", subclass: undefined, level: 3 },
    ];
    const { derived } = deriveEntryScopedResources(entries, 9, ABILITIES, 4, "EDITION_2014", getRowsByClassName);
    expect(derived?.expertiseChoiceCount).toBe(6);
  });
});
