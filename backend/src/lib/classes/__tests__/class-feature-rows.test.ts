// #1524: featuresFromRows — the ONE place the edition rule for feature TEXT
// lives, retired here from featureAppliesToEdition (registry.ts). Truth-table
// coverage for the predicate (edition match + level gate), plus the
// no-Prisma-import assertion that keeps lib/classes/ a pure leaf (mirrors
// lib/spellcasting/granted-spells.ts's GrantedSpellSource pattern).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { derivedStatFromRows, featuresFromRows, improvementsFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

function row(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test description", edition: "EDITION_2014", ...overrides };
}

describe("featuresFromRows edition + level truth table (#1524, retired from #1374's featureAppliesToEdition)", () => {
  it("a row tagged for the matching edition, at or below the character's level, is included", () => {
    const rows = [row({ edition: "EDITION_2014", level: 3 })];
    expect(featuresFromRows(rows, 3, "class", "EDITION_2014")).toHaveLength(1);
    expect(featuresFromRows(rows, 20, "class", "EDITION_2014")).toHaveLength(1);
  });

  it("a row tagged for the OTHER edition is excluded — never falls back (unlike AuthoredFeature's optional edition, every ClassFeature row names its own)", () => {
    const rows = [row({ edition: "EDITION_2014" })];
    expect(featuresFromRows(rows, 20, "class", "EDITION_2024")).toHaveLength(0);
  });

  it("a row above the character's level is excluded regardless of edition match", () => {
    const rows = [row({ edition: "EDITION_2024", level: 5 })];
    expect(featuresFromRows(rows, 4, "class", "EDITION_2024")).toHaveLength(0);
    expect(featuresFromRows(rows, 5, "class", "EDITION_2024")).toHaveLength(1);
  });

  it("a fork's two rows (same name, opposite edition) never both survive one edition's filter — proves the filter runs on the way OUT of the rows, before any merge could arbitrate between them", () => {
    const rows = [
      row({ name: "Domain Spells", level: 1, edition: "EDITION_2014", description: "2014 text" }),
      row({ name: "Domain Spells", level: 1, edition: "EDITION_2024", description: "2024 text" }),
    ];
    const at2014 = featuresFromRows(rows, 20, "subclass", "EDITION_2014");
    const at2024 = featuresFromRows(rows, 20, "subclass", "EDITION_2024");
    expect(at2014).toHaveLength(1);
    expect(at2014[0].description).toBe("2014 text");
    expect(at2024).toHaveLength(1);
    expect(at2024[0].description).toBe("2024 text");
  });

  it("stamps the requested `source` on every mapped feature and carries the row's own edition through (DerivedFeature.edition is required)", () => {
    const rows = [row({ name: "Rage", level: 1, edition: "EDITION_2024" })];
    const [feature] = featuresFromRows(rows, 1, "class", "EDITION_2024");
    expect(feature.source).toBe("class");
    expect(feature.edition).toBe("EDITION_2024");

    const [subFeature] = featuresFromRows(rows, 1, "subclass", "EDITION_2024");
    expect(subFeature.source).toBe("subclass");
  });

  it("an empty row list produces an empty feature list (the no-carrier default every narrow-select caller falls back to)", () => {
    expect(featuresFromRows([], 20, "class", "EDITION_2024")).toEqual([]);
  });
});

describe("derivedStatFromRows (#1530) — same edition/level truth table as featuresFromRows, plus MAX-across-rows", () => {
  it("a row tagged for the matching edition, at or below level, whose tier is reached, contributes its value", () => {
    const rows = [row({ derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] })];
    expect(derivedStatFromRows(rows, 4, "EDITION_2014", "attacksPerAction")).toBeUndefined();
    expect(derivedStatFromRows(rows, 5, "EDITION_2014", "attacksPerAction")).toBe(2);
  });

  it("a row above the character's level is excluded regardless of tier content", () => {
    const rows = [row({ level: 5, derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] })];
    expect(derivedStatFromRows(rows, 4, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("a row tagged for the OTHER edition is excluded — never falls back", () => {
    const rows = [row({ edition: "EDITION_2014", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 1, value: 2 }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2024", "attacksPerAction")).toBeUndefined();
  });

  it("a row naming a DIFFERENT derivedStat is excluded", () => {
    const rows = [row({ derivedStat: "somethingElse", derivedStatTiers: [{ minLevel: 1, value: 99 }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("takes the MAX across every qualifying row, not the first match — lets a base-class row and a subclass row compose", () => {
    const rows = [
      row({ name: "Extra Attack", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] }),
      row({ name: "Some Subclass Bonus Attack", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 4 }] }),
    ];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBe(4);
  });

  it("a row whose derivedStatTiers has a string value (e.g. a future crit-range column) is ignored, not coerced", () => {
    const rows = [row({ derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 1, value: "19-20" }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("an empty row list returns undefined (the caller supplies the floor, not this function)", () => {
    expect(derivedStatFromRows([], 20, "EDITION_2024", "attacksPerAction")).toBeUndefined();
  });
});

describe("improvementsFromRows (#1691) — same edition/level truth table as featuresFromRows, flattened across rows", () => {
  it("a row tagged for the matching edition, at or below the character's level, contributes its improvements", () => {
    const rows = [row({ level: 3, improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }] })];
    expect(improvementsFromRows(rows, 2, "EDITION_2014")).toEqual([]);
    expect(improvementsFromRows(rows, 3, "EDITION_2014")).toEqual([{ target: "armorProficiency", amount: 1, key: "heavy" }]);
  });

  it("a row tagged for the OTHER edition is excluded — never falls back", () => {
    const rows = [row({ edition: "EDITION_2014", improvements: [{ target: "initiative", amount: 1 }] })];
    expect(improvementsFromRows(rows, 20, "EDITION_2024")).toEqual([]);
  });

  it("a row with no improvements contributes nothing, even when active", () => {
    const rows = [row({ edition: "EDITION_2014", level: 1 })];
    expect(improvementsFromRows(rows, 20, "EDITION_2014")).toEqual([]);
  });

  it("flattens improvements across every qualifying row (a numeric target + a keyed proficiency target both reach the caller)", () => {
    const rows = [
      row({ name: "A", level: 1, edition: "EDITION_2014", improvements: [{ target: "skillProficiency", amount: 1, key: "athletics" }] }),
      row({ name: "B", level: 3, edition: "EDITION_2014", improvements: [{ target: "armorClass", amount: 1 }] }),
    ];
    expect(improvementsFromRows(rows, 3, "EDITION_2014")).toEqual([
      { target: "skillProficiency", amount: 1, key: "athletics" },
      { target: "armorClass", amount: 1 },
    ]);
    // Below B's level, only A's grant is active.
    expect(improvementsFromRows(rows, 2, "EDITION_2014")).toEqual([
      { target: "skillProficiency", amount: 1, key: "athletics" },
    ]);
  });

  it("an empty row list produces an empty improvements list (the no-carrier default every narrow-select caller falls back to)", () => {
    expect(improvementsFromRows([], 20, "EDITION_2024")).toEqual([]);
  });
});

describe("lib/classes/ stays a pure leaf (#1524)", () => {
  it("class-feature-rows.ts imports no Prisma module", () => {
    const path = fileURLToPath(new URL("../class-feature-rows.ts", import.meta.url));
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/from ["'].*prisma/i);
    expect(source).not.toMatch(/require\(["'].*prisma/i);
  });
});
