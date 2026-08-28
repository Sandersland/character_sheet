import { describe, expect, it } from "vitest";

import { choicesFromRows, type ChoiceCountTier, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { monk } from "@/lib/classes/monk.js";
import { ranger } from "@/lib/classes/ranger.js";

function row(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test description", edition: "EDITION_2024", ...overrides };
}

const FOUR_ELEMENTS_TIERS: ChoiceCountTier[] = [
  { minLevel: 3, count: 1 },
  { minLevel: 6, count: 2 },
  { minLevel: 11, count: 3 },
  { minLevel: 17, count: 4 },
];

function fourElementsRow(edition: ClassFeatureRow["edition"] = "EDITION_2014"): ClassFeatureRow {
  return row({
    name: "Disciple of the Elements",
    level: 3,
    edition,
    choiceKey: "fourElementsDisciplines",
    choiceLabel: "Elemental Disciplines",
    choiceCatalogSource: "discipline",
    choiceCountTiers: FOUR_ELEMENTS_TIERS,
  });
}

const fourElementsDef = monk.subclasses!["way of the four elements"].choices![0];
const hunterChoices = ranger.subclasses!.hunter.choices!;
const HUNTER_TIER_LEVELS = [3, 7, 11, 15];

describe("choicesFromRows (#899/#1522) — the row-driven SubclassChoice vocabulary", () => {
  describe("Four Elements shape: deep-equal against monk.ts's declaration through deriveSubclassChoiceList's own math", () => {
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

  describe("Hunter shape: four one-tier rows, deep-equal against ranger.ts's declaration, order preserved", () => {
    const hunterRows: ClassFeatureRow[] = hunterChoices.map((c, i) =>
      row({
        name: c.label,
        level: HUNTER_TIER_LEVELS[i],
        edition: "EDITION_2024",
        choiceKey: c.key,
        choiceCatalogSource: c.catalogSource,
        choiceCountTiers: [{ minLevel: HUNTER_TIER_LEVELS[i], count: 1 }],
      }),
    );

    for (const level of [2, 3, 7, 11, 15, 20]) {
      it(`level ${level}`, () => {
        const resolved = choicesFromRows(hunterRows, level, "EDITION_2024");
        const expected = hunterChoices
          .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
          .filter((c) => c.count > 0);
        expect(resolved).toEqual(expected);
      });
    }
  });

  it("edition filtering: a 2014-tagged choice row is invisible to a 2024 derive", () => {
    expect(choicesFromRows([fourElementsRow("EDITION_2014")], 10, "EDITION_2024")).toEqual([]);
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
