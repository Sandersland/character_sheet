import { describe, it, expect } from "vitest";

import { deriveCritRange } from "@/lib/srd/srd.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

// Synthetic fixtures pin the row SHAPE (#1120), not a read of the real seed.
// Both tiers share one row; deriveCritRange resolves cross-tier via last-match-wins, unlike deriveAttacksPerAction's cross-row MAX.
const CRIT_RANGE_TIERS = [
  { minLevel: 3, value: 19 },
  { minLevel: 15, value: 18 },
];

function improvedCriticalRow(edition: "EDITION_2014" | "EDITION_2024"): ClassFeatureRow {
  return {
    name: "Improved Critical",
    level: 3,
    description: "test fixture row",
    edition,
    derivedStat: "critRange",
    derivedStatTiers: CRIT_RANGE_TIERS,
  };
}

// Byte-identical tiers both editions (SRD 5.1 / SRD 5.2 agree, #1120) — deriveCritRange itself takes no edition parameter.
function championSubclassRows(): ClassFeatureRow[] {
  return [improvedCriticalRow("EDITION_2014"), improvedCriticalRow("EDITION_2024")];
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

function critRange(entries: Entry[], edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024"): number {
  return deriveCritRange(entries, edition, getFeatureRows);
}

describe("deriveCritRange — Champion, both editions (#1120)", () => {
  for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
    it(`${edition}: 20 below L3, 19 at L3-14, 18 at L15+`, () => {
      expect(critRange([entry(2, [], championSubclassRows())], edition)).toBe(20);
      expect(critRange([entry(3, [], championSubclassRows())], edition)).toBe(19);
      expect(critRange([entry(14, [], championSubclassRows())], edition)).toBe(19);
      expect(critRange([entry(15, [], championSubclassRows())], edition)).toBe(18);
      expect(critRange([entry(20, [], championSubclassRows())], edition)).toBe(18);
    });
  }

  // Mutation proof: an edition branch inside deriveCritRange would show up as the two loop iterations disagreeing.
  it("both editions agree at every gate level (proves no hidden edition branch)", () => {
    const levels = [2, 3, 14, 15, 20];
    for (const level of levels) {
      expect(critRange([entry(level, [], championSubclassRows())], "EDITION_2014")).toBe(
        critRange([entry(level, [], championSubclassRows())], "EDITION_2024"),
      );
    }
  });
});

describe("deriveCritRange — non-Champion / no qualifying row", () => {
  it("a fighter with no Champion subclass rows always crits only on 20", () => {
    expect(critRange([entry(20)])).toBe(20);
  });

  it("empty class list -> 20", () => {
    expect(deriveCritRange([], "EDITION_2024", getFeatureRows)).toBe(20);
  });

  it("a homebrew subclass whose name merely resembles Champion has no matching row -> 20", () => {
    // Unrepresentable, not guarded (#1277/#1339): a homebrew entry's subclassRows carrier is simply empty, so there is no row to match.
    expect(critRange([entry(20, [], [])])).toBe(20);
  });
});

describe("deriveCritRange — multiclass keys off the Champion ENTRY's own level, never total character level (#1070)", () => {
  it("a level-2 Champion entry stays at 20 even alongside a level-20 total character", () => {
    // deriveCritRange reads each entry's OWN `level` — a second entry pushing the character total higher must not leak into this entry's gate.
    expect(critRange([entry(2, [], championSubclassRows()), entry(18)])).toBe(20);
  });

  it("a level-3 Champion entry unlocks 19 regardless of a second entry's level", () => {
    expect(critRange([entry(3, [], championSubclassRows()), entry(1)])).toBe(19);
  });

  it("two entries neither of which is Champion -> 20 (never summed, never averaged)", () => {
    expect(critRange([entry(20), entry(20)])).toBe(20);
  });
});

// Mutation proof: a corrupted tier value must change the result, not just pass.
describe("deriveCritRange — mutation sensitivity", () => {
  it("a corrupted tier value changes the derived result", () => {
    const corrupted = [
      {
        name: "Improved Critical",
        level: 3,
        description: "test fixture row",
        edition: "EDITION_2024" as const,
        derivedStat: "critRange",
        derivedStatTiers: [{ minLevel: 3, value: 15 }],
      },
    ];
    expect(critRange([entry(3, [], corrupted)])).toBe(15);
    expect(critRange([entry(3, [], corrupted)])).not.toBe(19);
  });
});
