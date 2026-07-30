// #1524: featuresFromRows — the ONE place the edition rule for feature TEXT
// lives, retired here from featureAppliesToEdition (registry.ts). Truth-table
// coverage for the predicate (edition match + level gate), plus the
// no-Prisma-import assertion that keeps lib/classes/ a pure leaf (mirrors
// lib/spellcasting/granted-spells.ts's GrantedSpellSource pattern).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { featuresFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

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

describe("lib/classes/ stays a pure leaf (#1524)", () => {
  it("class-feature-rows.ts imports no Prisma module", () => {
    const path = fileURLToPath(new URL("../class-feature-rows.ts", import.meta.url));
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/from ["'].*prisma/i);
    expect(source).not.toMatch(/require\(["'].*prisma/i);
  });
});
