import { describe, it, expect } from "vitest";

import { deriveAttacksPerAction } from "@/lib/srd/srd.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

// Pure unit test — no database — for #1530's row-driven deriveAttacksPerAction.
// EXTRA_ATTACK_TIERS (a TS Record keyed by class name) is retired; these rows
// mirror what the seed actually authors (fighter-features.ts, barbarian-features.ts,
// monk.ts, paladin-features.ts, ranger.ts, bard-features.ts's College of Valor rows) closely
// enough to pin the SHAPE (ascending tiers, one row carrying all of Fighter's
// three), but are synthetic fixtures, not a read of the real seed — see
// extra-attack-seeded.test.ts (lib/classes/__tests__/) for the DB-backed
// proof that the actual seeded rows carry these values.
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

// Both editions' rows, byte-identical tiers — mirrors fighter-features.ts:
// the rule is edition-invariant even though 2024 decomposes the L11/L20
// tiers into their own (text-only, no derivedStat) named features.
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

  // Below the row's OWN grant level, that entry contributes nothing — mirrors
  // a multiclass character whose levels in one class haven't reached the
  // feature yet, per entry (never total character level).
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

  // #1277/#1339: attacksForClass's Valor check used to substring-match on
  // "valor" (or fall back to an exact-name lookup), so a homebrew subclass
  // could inherit Extra Attack it never earned. A row is keyed by subclassId
  // (the FK, resolved at SEED time), so a homebrew entry — whatever its name
  // — simply never has this row in its subclassRows carrier. Unrepresentable
  // rather than guarded: there is no substring or exact-name check left to
  // get wrong at this call site.
  it('a homebrew subclass whose name merely CONTAINS "Valor" has no matching row → 1 attack', () => {
    expect(attacks([entry(10, [], [])])).toBe(1);
  });

  // [arbiter]: a homebrew subclass named EXACTLY "College of Valor" but with
  // subclassId: null also gets 1 — a behaviour change from the pre-#1530
  // resolveSubclassSlug exact-name fallback, and the intended #1277/#1524
  // semantics (an FK-null entry's subclassRef.features is empty, so it
  // already shows no subclass features at all elsewhere on the sheet).
  it('a homebrew subclass named EXACTLY "College of Valor" with no FK also gets 1 attack', () => {
    expect(attacks([entry(10, [], [])])).toBe(1);
  });
});

// Mutation proof (#1530 AC): corrupting an authored tier value must be
// visible here as a wrong RESULT, not merely a passing test — demonstrates
// the assertions above are actually sensitive to the tier value, not just to
// row presence.
describe("deriveAttacksPerAction — mutation sensitivity", () => {
  it("a corrupted tier value changes the derived result", () => {
    const corrupted = [attacksRow(5, [{ minLevel: 5, value: 99 }], "EDITION_2024")];
    expect(attacks([entry(5, corrupted)])).toBe(99);
    expect(attacks([entry(5, corrupted)])).not.toBe(2);
  });
});
