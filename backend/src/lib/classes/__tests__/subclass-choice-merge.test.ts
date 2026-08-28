import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/registry.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

import { WAY_OF_THE_FOUR_ELEMENTS_ROWS } from "./test-feature-rows.fixture.js";

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

function fixtureChoiceRow(level: number, edition: ClassFeatureRow["edition"] = "EDITION_2024"): ClassFeatureRow {
  return {
    name: "Fixture Choice Feature",
    level,
    description: "",
    edition,
    choiceKey: "fixtureChoice",
    choiceCatalogSource: "fixtureCatalog",
    choiceCountTiers: [{ minLevel: level, count: 2 }],
  };
}

// deriveSubclassChoiceList's DEF-WINS collision rule (`fromDef` beating
// `sub.rowChoices` on a same-key match) is dead code now: no SubclassDefinition
// declares `.choices` any more, so `fromDef` is unconditionally `[]`. Kept
// until the ResourceFn/SubclassDefinition overlay is deleted; the cases below
// pin the rows-only path against the shared fixture's Disciple row (EDITION_2014).
describe("deriveSubclassChoiceList registry merge (#899/#1522) — rows-only path (no TS def.choices left to collide with)", () => {
  const fourElementsDisciplinesRow = WAY_OF_THE_FOUR_ELEMENTS_ROWS.find((r) => r.name === "Disciple of the Elements");
  if (!fourElementsDisciplinesRow) throw new Error("fixture missing Disciple of the Elements row");

  it("a subclass's own choice row resolves through deriveResources with no def to merge against", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [fourElementsDisciplinesRow],
      subclassLevel: 3,
    };
    const info = deriveResources("monk", "way of the four elements", 6, ABILITY_SCORES, 3, featureRows, "EDITION_2014");
    expect(info?.subclassChoices).toEqual([
      { key: "fourElementsDisciplines", label: "Elemental Disciplines", catalogSource: "discipline", count: 2 },
    ]);
  });

  it("two non-colliding row entries both appear, in row declaration order", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [fourElementsDisciplinesRow, fixtureChoiceRow(3, "EDITION_2014")],
      subclassLevel: 3,
    };
    const info = deriveResources("monk", "way of the four elements", 6, ABILITY_SCORES, 3, featureRows, "EDITION_2014");
    expect(info?.subclassChoices).toEqual([
      { key: "fourElementsDisciplines", label: "Elemental Disciplines", catalogSource: "discipline", count: 2 },
      { key: "fixtureChoice", label: "Fixture Choice Feature", catalogSource: "fixtureCatalog", count: 2 },
    ]);
  });

  it("no rows carrier at all resolves to no choices (there is no def left to fall back to)", () => {
    const info = deriveResources("monk", "way of the four elements", 6, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(info?.subclassChoices).toBeUndefined();
  });

  it("rows-only subclass (no TS def.choices) resolves end to end through deriveResources", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [],
      subclassRows: [fixtureChoiceRow(3)],
      subclassLevel: 3,
    };
    const info = deriveResources("monk", "warrior of the open hand", 3, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info?.subclassChoices).toEqual([{ key: "fixtureChoice", label: "Fixture Choice Feature", catalogSource: "fixtureCatalog", count: 2 }]);
  });

  it("undefined (not present) when the merged list is empty, even though the character has other resources", () => {
    const featureRows: ClassFeatureRowsCarrier = { classRows: [DUMMY_CLASS_ROW], subclassRows: [], subclassLevel: 3 };
    const info = deriveResources("monk", "warrior of the open hand", 3, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info).not.toBeNull();
    expect(info?.subclassChoices).toBeUndefined();
  });

  it("gating on sub.active: an inactive subclass yields no row choices even though rows are declared", () => {
    const featureRows: ClassFeatureRowsCarrier = {
      classRows: [DUMMY_CLASS_ROW],
      subclassRows: [fixtureChoiceRow(1)],
      subclassLevel: 3,
    };
    const info = deriveResources("monk", "warrior of the open hand", 1, ABILITY_SCORES, 3, featureRows, "EDITION_2024");
    expect(info).not.toBeNull();
    expect(info?.subclassChoices).toBeUndefined();
  });
});
