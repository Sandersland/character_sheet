// Reads the same derivedStatFromRows every real character derivation calls — never a hand-rolled re-derivation of the tier table.
import { describe, expect, it } from "vitest";

import { derivedStatFromRows } from "@/lib/classes/class-feature-rows.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import { BARD_FEATURES } from "../bard-features.js";
import { RANGER_FEATURES } from "../ranger-features.js";
import { ROGUE_FEATURES } from "../rogue-features.js";
import { WIZARD_FEATURES } from "../wizard-features.js";

const BASE_ROWS = {
  rogue: ROGUE_FEATURES.filter((r) => r.subclassSlug === null),
  bard: BARD_FEATURES.filter((r) => r.subclassSlug === null),
  ranger: RANGER_FEATURES.filter((r) => r.subclassSlug === null),
  wizard: WIZARD_FEATURES.filter((r) => r.subclassSlug === null),
};

function expertiseCountFor(className: keyof typeof BASE_ROWS, edition: RulesEdition, level: number): number | undefined {
  return derivedStatFromRows(BASE_ROWS[className], level, edition, "expertiseChoiceCount");
}

describe("Rogue Expertise (#1588): 2014 + 2024, 2 at L1, 4 at L6 (PHB'14 p.96 / SRD 5.2)", () => {
  it("2014", () => {
    expect(expertiseCountFor("rogue", "EDITION_2014", 1)).toBe(2);
    expect(expertiseCountFor("rogue", "EDITION_2014", 5)).toBe(2);
    expect(expertiseCountFor("rogue", "EDITION_2014", 6)).toBe(4);
    expect(expertiseCountFor("rogue", "EDITION_2014", 20)).toBe(4);
  });
  it("2024", () => {
    expect(expertiseCountFor("rogue", "EDITION_2024", 1)).toBe(2);
    expect(expertiseCountFor("rogue", "EDITION_2024", 6)).toBe(4);
  });
});

describe("Bard Expertise (#1588): 2014 L3/L10, 2024 L2/L9 (PHB'14 p.53 / SRD 5.2.1 classes.md)", () => {
  it("2014: 2 at L3, 4 at L10", () => {
    expect(expertiseCountFor("bard", "EDITION_2014", 2)).toBeUndefined();
    expect(expertiseCountFor("bard", "EDITION_2014", 3)).toBe(2);
    expect(expertiseCountFor("bard", "EDITION_2014", 9)).toBe(2);
    expect(expertiseCountFor("bard", "EDITION_2014", 10)).toBe(4);
  });
  it("2024: 2 at L2, 4 at L9 — a level EARLIER than the 2014 row (the seeded row's own grant level, not the plan's initial 3/10 assumption)", () => {
    expect(expertiseCountFor("bard", "EDITION_2024", 1)).toBeUndefined();
    expect(expertiseCountFor("bard", "EDITION_2024", 2)).toBe(2);
    expect(expertiseCountFor("bard", "EDITION_2024", 8)).toBe(2);
    expect(expertiseCountFor("bard", "EDITION_2024", 9)).toBe(4);
  });
});

describe("Ranger Expertise (#1588): 2024 only, across Deft Explorer (L2) and Expertise (L9)", () => {
  it("1 at L2, 3 at L9", () => {
    expect(expertiseCountFor("ranger", "EDITION_2024", 1)).toBeUndefined();
    expect(expertiseCountFor("ranger", "EDITION_2024", 2)).toBe(1);
    expect(expertiseCountFor("ranger", "EDITION_2024", 8)).toBe(1);
    expect(expertiseCountFor("ranger", "EDITION_2024", 9)).toBe(3);
  });
  it("2014 grants no Expertise", () => {
    expect(expertiseCountFor("ranger", "EDITION_2014", 20)).toBeUndefined();
  });
});

describe("Wizard Scholar (#1588): 2024 only, 1 at L2", () => {
  it("1 at L2", () => {
    expect(expertiseCountFor("wizard", "EDITION_2024", 1)).toBeUndefined();
    expect(expertiseCountFor("wizard", "EDITION_2024", 2)).toBe(1);
    expect(expertiseCountFor("wizard", "EDITION_2024", 20)).toBe(1);
  });
  it("2014 grants no Expertise", () => {
    expect(expertiseCountFor("wizard", "EDITION_2014", 20)).toBeUndefined();
  });
});
