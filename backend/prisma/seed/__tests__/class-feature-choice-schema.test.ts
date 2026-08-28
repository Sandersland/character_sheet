import { describe, expect, it } from "vitest";

import { classFeatureSeedSchema } from "../class-features.js";

const subclassRow = {
  className: "Ranger",
  subclassSlug: "ranger-hunter" as const,
  name: "Test Choice Feature",
  level: 3,
  description: "test",
  edition: "EDITION_2024" as const,
};

const baseClassRow = {
  ...subclassRow,
  subclassSlug: null,
};

const fullChoiceColumns = {
  choiceKey: "fourElementsDisciplines",
  choiceLabel: "Elemental Disciplines",
  choiceCatalogSource: "discipline",
  choiceCountTiers: [{ minLevel: 3, count: 1 }],
};

describe("classFeatureSeedSchema choice columns (#899/#1522)", () => {
  it("accepts a full declaration with choiceLabel, on a subclass-scoped row", () => {
    const result = classFeatureSeedSchema.safeParse({ ...subclassRow, ...fullChoiceColumns });
    expect(result.success).toBe(true);
  });

  it("accepts the trio with choiceLabel omitted (falls back to row.name at resolution)", () => {
    const { choiceKey, choiceCatalogSource, choiceCountTiers } = fullChoiceColumns;
    const result = classFeatureSeedSchema.safeParse({ ...subclassRow, choiceKey, choiceCatalogSource, choiceCountTiers });
    expect(result.success).toBe(true);
  });

  it("null/absent choice columns are valid (the common, zero-behavior-change case)", () => {
    expect(classFeatureSeedSchema.safeParse(subclassRow).success).toBe(true);
    expect(classFeatureSeedSchema.safeParse({ ...subclassRow, choiceCountTiers: null }).success).toBe(true);
  });

  describe("choiceColumnsDeclareTogether — all-or-nothing on the trio", () => {
    it("rejects choiceKey alone (missing choiceCatalogSource + choiceCountTiers)", () => {
      const result = classFeatureSeedSchema.safeParse({ ...subclassRow, choiceKey: fullChoiceColumns.choiceKey });
      expect(result.success).toBe(false);
    });

    it("rejects choiceCatalogSource alone (missing choiceKey + choiceCountTiers)", () => {
      const result = classFeatureSeedSchema.safeParse({ ...subclassRow, choiceCatalogSource: fullChoiceColumns.choiceCatalogSource });
      expect(result.success).toBe(false);
    });

    it("rejects choiceCountTiers alone (missing choiceKey + choiceCatalogSource)", () => {
      const result = classFeatureSeedSchema.safeParse({ ...subclassRow, choiceCountTiers: fullChoiceColumns.choiceCountTiers });
      expect(result.success).toBe(false);
    });

    it("rejects choiceKey + choiceCatalogSource without choiceCountTiers", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
      });
      expect(result.success).toBe(false);
    });

    it("rejects choiceKey + choiceCountTiers without choiceCatalogSource", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCountTiers: fullChoiceColumns.choiceCountTiers,
      });
      expect(result.success).toBe(false);
    });

    it("rejects choiceCatalogSource + choiceCountTiers without choiceKey", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: fullChoiceColumns.choiceCountTiers,
      });
      expect(result.success).toBe(false);
    });

    it("rejects choiceLabel without the trio", () => {
      const result = classFeatureSeedSchema.safeParse({ ...subclassRow, choiceLabel: fullChoiceColumns.choiceLabel });
      expect(result.success).toBe(false);
    });
  });

  describe("choiceCountTiers array invariants", () => {
    it("rejects a 0-count tier — authoring garbage, below-first-tier already expresses 'not yet'", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [{ minLevel: 3, count: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a negative count", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [{ minLevel: 3, count: -1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty tiers array — authoring garbage, same as resourceRechargeTiers", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a descending tier order — the Four Elements shape authored backwards", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [
          { minLevel: 17, count: 4 },
          { minLevel: 11, count: 3 },
          { minLevel: 6, count: 2 },
          { minLevel: 3, count: 1 },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("accepts the real Four Elements ascending shape", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [
          { minLevel: 3, count: 1 },
          { minLevel: 6, count: 2 },
          { minLevel: 11, count: 3 },
          { minLevel: 17, count: 4 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("choiceTiersStartAtOrAfterRowLevel — a tier below the row's own level would silently never fire there", () => {
    it("rejects a first tier minLevel BELOW the row's own level (row is level 3, tier starts at 1)", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [{ minLevel: 1, count: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts a first tier minLevel EQUAL to the row's own level", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [{ minLevel: subclassRow.level, count: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts a first tier minLevel ABOVE the row's own level (a real authored gap)", () => {
      const result = classFeatureSeedSchema.safeParse({
        ...subclassRow,
        choiceKey: fullChoiceColumns.choiceKey,
        choiceCatalogSource: fullChoiceColumns.choiceCatalogSource,
        choiceCountTiers: [{ minLevel: subclassRow.level + 3, count: 1 }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("choiceRowIsSubclassScoped", () => {
    it("rejects choice columns on a base-class row (subclassSlug: null)", () => {
      const result = classFeatureSeedSchema.safeParse({ ...baseClassRow, ...fullChoiceColumns });
      expect(result.success).toBe(false);
    });

    it("a base-class row with no choice columns at all is still valid", () => {
      const result = classFeatureSeedSchema.safeParse(baseClassRow);
      expect(result.success).toBe(true);
    });
  });
});
