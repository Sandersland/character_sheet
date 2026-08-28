import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/registry.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

const ABILITY_SCORES = { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 };

// Keeps deriveResources non-null so an undefined subclassChoices stays observable.
const DUMMY_CLASS_ROW: ClassFeatureRow = {
  name: "Dummy Pool",
  level: 1,
  description: "",
  edition: "EDITION_2024",
  resourceKey: "dummyPool",
  resourceTotals: [{ minLevel: 1, total: 3 }],
};

function fixtureChoiceRow(level: number): ClassFeatureRow {
  return {
    name: "Fixture Choice Feature",
    level,
    description: "",
    edition: "EDITION_2024",
    choiceKey: "fixtureChoice",
    choiceCatalogSource: "fixtureCatalog",
    choiceCountTiers: [{ minLevel: level, count: 2 }],
  };
}

describe("deriveSubclassChoiceList registry merge (#899/#1522) — DEF-WINS BY KEY", () => {
  it("def wins on a same-key collision with a row-driven choice, non-colliding def entries still appear", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [
        {
          name: "Row Hunter's Prey",
          level: 3,
          description: "",
          edition: "EDITION_2024",
          choiceKey: "huntersPrey",
          choiceLabel: "Row Label Should Not Win",
          choiceCatalogSource: "rowCatalogShouldNotWin",
          choiceCountTiers: [{ minLevel: 3, count: 99 }],
        },
      ],
      subclassLevel: 3,
    };
    const info = deriveResources("ranger", "hunter", 7, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info?.subclassChoices).toEqual([
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
    ]);
  });

  it("combined ordering: def entries first (declaration order), non-colliding row entries appended after", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [fixtureChoiceRow(3)],
      subclassLevel: 3,
    };
    const info = deriveResources("ranger", "hunter", 7, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info?.subclassChoices).toEqual([
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
      { key: "fixtureChoice", label: "Fixture Choice Feature", catalogSource: "fixtureCatalog", count: 2 },
    ]);
  });

  it("def-only subclass (no rows carrier) resolves exactly as today", () => {
    const info = deriveResources("ranger", "hunter", 7, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(info?.subclassChoices).toEqual([
      { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: 1 },
      { key: "defensiveTactics", label: "Defensive Tactics", catalogSource: "defensiveTactics", count: 1 },
    ]);
  });

  it("rows-only subclass (no TS def.choices) resolves end to end through deriveResources", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [fixtureChoiceRow(3)],
      subclassLevel: 3,
    };
    const info = deriveResources("ranger", "beast master", 3, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info?.subclassChoices).toEqual([{ key: "fixtureChoice", label: "Fixture Choice Feature", catalogSource: "fixtureCatalog", count: 2 }]);
  });

  it("undefined (not present) when the merged list is empty, even though the character has other resources", () => {
    const featureRows: ClassFeatureRowsCarrier = { classRows: [DUMMY_CLASS_ROW], subclassRows: [], subclassLevel: 3 };
    const info = deriveResources("ranger", "beast master", 3, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info).not.toBeNull();
    expect(info?.subclassChoices).toBeUndefined();
  });

  it("gating on sub.active: an inactive subclass yields no row choices even though rows are declared", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [DUMMY_CLASS_ROW],
      subclassRows: [fixtureChoiceRow(1)],
      subclassLevel: 3,
    };
    const info = deriveResources("ranger", "beast master", 1, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info).not.toBeNull();
    expect(info?.subclassChoices).toBeUndefined();
  });
});
