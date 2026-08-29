import { describe, expect, it } from "vitest";

import { choicesFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

import { WAY_OF_THE_FOUR_ELEMENTS_ROWS } from "./test-feature-rows.fixture.js";

function row(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test description", edition: "EDITION_2024", ...overrides };
}

const disciple = WAY_OF_THE_FOUR_ELEMENTS_ROWS.find((r) => r.name === "Disciple of the Elements");
if (!disciple) throw new Error("fixture missing Disciple of the Elements row");
const fourElementsRow = (): ClassFeatureRow => disciple;

// Independent oracle (not copied from the row) — PHB'14 pp. 78, 80: 1/2/3/4 discipline slots at L3/6/11/17.
const fourElementsDef = {
  key: "fourElementsDisciplines",
  label: "Elemental Disciplines",
  catalogSource: "discipline",
  count: (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 6 ? 2 : level >= 3 ? 1 : 0),
};

const FOUR_TIER_CHOICE_SHAPE: { key: string; label: string; catalogSource: string; count: (level: number) => number }[] = [
  { key: "tierOne", label: "Tier One", catalogSource: "tierOne", count: (l) => (l >= 3 ? 1 : 0) },
  { key: "tierTwo", label: "Tier Two", catalogSource: "tierTwo", count: (l) => (l >= 7 ? 1 : 0) },
  { key: "tierThree", label: "Tier Three", catalogSource: "tierThree", count: (l) => (l >= 11 ? 1 : 0) },
  { key: "tierFour", label: "Tier Four", catalogSource: "tierFour", count: (l) => (l >= 15 ? 1 : 0) },
];
const FOUR_TIER_LEVELS = [3, 7, 11, 15];

describe("choicesFromRows (#899/#1522) — the row-driven SubclassChoice vocabulary", () => {
  describe("Four Elements shape: deep-equal against the seeded row's own tier table", () => {
    for (const level of [2, 3, 5, 6, 10, 11, 16, 17, 20]) {
      it(`level ${level}`, () => {
        const resolved = choicesFromRows([fourElementsRow()], level, "EDITION_2014");
        const expectedCount = fourElementsDef.count(level);
        const expected =
          expectedCount > 0
            ? [{ key: fourElementsDef.key, label: fourElementsDef.label, catalogSource: fourElementsDef.catalogSource, count: expectedCount }]
            : [];
        expect(resolved).toEqual(expected);
      });
    }
  });

  describe("Four-tier shape: four one-tier rows at different grant levels, order preserved", () => {
    const fourTierRows: ClassFeatureRow[] = FOUR_TIER_CHOICE_SHAPE.map((c, i) =>
      row({
        name: c.label,
        level: FOUR_TIER_LEVELS[i],
        edition: "EDITION_2024",
        choiceKey: c.key,
        choiceCatalogSource: c.catalogSource,
        choiceCountTiers: [{ minLevel: FOUR_TIER_LEVELS[i], count: 1 }],
      }),
    );

    for (const level of [2, 3, 7, 11, 15, 20]) {
      it(`level ${level}`, () => {
        const resolved = choicesFromRows(fourTierRows, level, "EDITION_2024");
        const expected = FOUR_TIER_CHOICE_SHAPE
          .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
          .filter((c) => c.count > 0);
        expect(resolved).toEqual(expected);
      });
    }
  });

  it("edition filtering: a 2014-tagged choice row is invisible to a 2024 derive", () => {
    expect(choicesFromRows([fourElementsRow()], 10, "EDITION_2024")).toEqual([]);
  });

  it("below-first-tier yields no entry", () => {
    expect(choicesFromRows([fourElementsRow()], 2, "EDITION_2014")).toEqual([]);
  });

  it("a resolved count of 0 yields no entry (defensive, matching today's positive-count filter)", () => {
    const rows = [row({ choiceKey: "x", choiceCatalogSource: "y", choiceCountTiers: [{ minLevel: 1, count: 0 }] })];
    expect(choicesFromRows(rows, 5, "EDITION_2024")).toEqual([]);
  });

  it("label falls back to row.name when choiceLabel is absent", () => {
    const rows = [row({ name: "My Feature", choiceKey: "x", choiceCatalogSource: "y", choiceCountTiers: [{ minLevel: 1, count: 2 }] })];
    expect(choicesFromRows(rows, 5, "EDITION_2024")).toEqual([{ key: "x", label: "My Feature", catalogSource: "y", count: 2 }]);
  });

  it("a row with no choiceKey is ignored", () => {
    const rows = [row({ choiceCatalogSource: "y", choiceCountTiers: [{ minLevel: 1, count: 2 }] })];
    expect(choicesFromRows(rows, 5, "EDITION_2024")).toEqual([]);
  });

  it("a row with choiceKey but null choiceCatalogSource is skipped, not fabricated", () => {
    const rows = [row({ choiceKey: "x", choiceCatalogSource: null, choiceCountTiers: [{ minLevel: 1, count: 2 }] })];
    expect(choicesFromRows(rows, 5, "EDITION_2024")).toEqual([]);
  });

  it("a tier gap between row.level and the first tier's minLevel: no entry until the tier is reached", () => {
    const rows = [row({ level: 3, name: "Gap Feature", choiceKey: "gapChoice", choiceCatalogSource: "cat", choiceCountTiers: [{ minLevel: 6, count: 1 }] })];
    for (const level of [3, 4, 5]) {
      expect(choicesFromRows(rows, level, "EDITION_2024")).toEqual([]);
    }
    expect(choicesFromRows(rows, 6, "EDITION_2024")).toEqual([{ key: "gapChoice", label: "Gap Feature", catalogSource: "cat", count: 1 }]);
  });

  it("row order is preserved in the output", () => {
    const rows = [
      row({ name: "Second", level: 1, choiceKey: "second", choiceCatalogSource: "cat", choiceCountTiers: [{ minLevel: 1, count: 1 }] }),
      row({ name: "First", level: 1, choiceKey: "first", choiceCatalogSource: "cat", choiceCountTiers: [{ minLevel: 1, count: 1 }] }),
    ];
    expect(choicesFromRows(rows, 5, "EDITION_2024").map((c) => c.key)).toEqual(["second", "first"]);
  });
});
