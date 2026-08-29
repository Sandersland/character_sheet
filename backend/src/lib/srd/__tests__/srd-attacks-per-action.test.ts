import { describe, it, expect } from "vitest";

import { deriveAttacksPerAction } from "@/lib/srd/srd.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

// Synthetic fixtures pin the row SHAPE (#1530), not a read of the real seed.
function attacksRow(
  level: number,
  tiers: { minLevel: number; value: number }[],
  edition: "EDITION_2014" | "EDITION_2024",
): ClassFeatureRow {
  return {
    name: "Extra Attack",
    level,
    description: "test fixture row",
    edition,
    derivedStat: "attacksPerAction",
    derivedStatTiers: tiers,
  };
}

const FIGHTER_TIERS = [
  { minLevel: 5, value: 2 },
  { minLevel: 11, value: 3 },
  { minLevel: 20, value: 4 },
];

// Byte-identical tiers both editions — edition-invariant even though 2024 decomposes L11/L20 into separate named features.
function fighterRows(): ClassFeatureRow[] {
  return [attacksRow(5, FIGHTER_TIERS, "EDITION_2014"), attacksRow(5, FIGHTER_TIERS, "EDITION_2024")];
}

function singleTierRows(grantLevel: number): ClassFeatureRow[] {
  const tiers = [{ minLevel: grantLevel, value: 2 }];
  return [attacksRow(grantLevel, tiers, "EDITION_2014"), attacksRow(grantLevel, tiers, "EDITION_2024")];
}

interface Entry {
  level: number;
  classRows: ClassFeatureRow[];
  subclassRows: ClassFeatureRow[];
}

function entry(level: number, classRows: ClassFeatureRow[] = [], subclassRows: ClassFeatureRow[] = []): Entry {
  return { level, classRows, subclassRows };
}

const getFeatureRows = (e: Entry): ClassFeatureRowsCarrier => ({ classRows: e.classRows, subclassRows: e.subclassRows });

function attacks(entries: Entry[], edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024"): number {
  return deriveAttacksPerAction(entries, edition, getFeatureRows);
}

describe("deriveAttacksPerAction — fighter, both editions (#1530)", () => {
  for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
    it(`${edition}: scales 1/2/3/4 at levels 4/5/11/20 from the single L5 row`, () => {
      expect(attacks([entry(4, fighterRows())], edition)).toBe(1);
      expect(attacks([entry(5, fighterRows())], edition)).toBe(2);
      expect(attacks([entry(11, fighterRows())], edition)).toBe(3);
      expect(attacks([entry(20, fighterRows())], edition)).toBe(4);
    });
  }
});

describe("deriveAttacksPerAction — barbarian / monk / paladin / ranger", () => {
  it("1 below L5, 2 at L5+ with no further scaling", () => {
    expect(attacks([entry(4, singleTierRows(5))])).toBe(1);
    expect(attacks([entry(5, singleTierRows(5))])).toBe(2);
    expect(attacks([entry(20, singleTierRows(5))])).toBe(2);
  });
});

describe("deriveAttacksPerAction — no Extra Attack row at all", () => {
  it("always 1", () => {
    expect(attacks([entry(20)])).toBe(1);
  });

  it("empty class list → 1", () => {
    expect(deriveAttacksPerAction([], "EDITION_2024", getFeatureRows)).toBe(1);
  });
});

describe("deriveAttacksPerAction — multiclass takes the max (never summed)", () => {
  it("Fighter 5 / class-with-L5-tier 5 → 2", () => {
    expect(attacks([entry(5, fighterRows()), entry(5, singleTierRows(5))])).toBe(2);
  });

  it("Fighter 11 / class-with-L5-tier 5 → 3", () => {
    expect(attacks([entry(11, fighterRows()), entry(5, singleTierRows(5))])).toBe(3);
  });

  it("no Extra Attack on either entry → 1", () => {
    expect(attacks([entry(20), entry(20)])).toBe(1);
  });

  // Below the row's OWN grant level, that entry contributes nothing — per entry, never total character level.
  it("Fighter 4 / class-with-L5-tier 5 multiclass → 2", () => {
    expect(attacks([entry(4, fighterRows()), entry(5, singleTierRows(5))])).toBe(2);
  });
});

describe("deriveAttacksPerAction — College of Valor bard (subclass row, no name/slug branch)", () => {
  const valorRows = singleTierRows(6);

  it("grants a second attack at bard level 6, not before", () => {
    expect(attacks([entry(5, [], valorRows)])).toBe(1);
    expect(attacks([entry(6, [], valorRows)])).toBe(2);
  });

  it("College of Lore (no subclassRows entry) never gets Extra Attack", () => {
    expect(attacks([entry(20, [], [])])).toBe(1);
  });

  // Rows are keyed by subclassId (FK, resolved at seed time) — a homebrew subclass never gets this row regardless of its name (#1277/#1339).
  it('a homebrew subclass whose name merely CONTAINS "Valor" has no matching row → 1 attack', () => {
    expect(attacks([entry(10, [], [])])).toBe(1);
  });

  // FK-null entry's subclassRef.features is empty, so no subclass features anywhere (#1277/#1524).
  it('a homebrew subclass named EXACTLY "College of Valor" with no FK also gets 1 attack', () => {
    expect(attacks([entry(10, [], [])])).toBe(1);
  });
});

// Mutation proof: a corrupted tier value must change the result, not just pass (#1530).
describe("deriveAttacksPerAction — mutation sensitivity", () => {
  it("a corrupted tier value changes the derived result", () => {
    const corrupted = [attacksRow(5, [{ minLevel: 5, value: 99 }], "EDITION_2024")];
    expect(attacks([entry(5, corrupted)])).toBe(99);
    expect(attacks([entry(5, corrupted)])).not.toBe(2);
  });
});
