// #1530: DB-backed proof that the REAL seeded ClassFeature rows carry the
// derivedStat/derivedStatTiers values the unit tests (srd-attacks-per-
// action.test.ts, class-feature-rows.test.ts) assume with synthetic
// fixtures — mirrors feature-edition.test.ts's loadDbFeatureRows pattern
// (the same reason that file exists: a synthetic-row unit test proves the
// FUNCTION is correct, never that the SEED is).
import { describe, expect, it } from "vitest";

import { deriveAttacksPerAction } from "@/lib/srd/extra-attack.js";
import type { ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const EDITIONS = ["EDITION_2014", "EDITION_2024"] as const;

async function attacksAt(
  className: string,
  subclass: string | undefined,
  level: number,
  edition: (typeof EDITIONS)[number],
): Promise<number> {
  const rows = await loadDbFeatureRows(className, subclass);
  const carrier: ClassFeatureRowsCarrier = rows;
  return deriveAttacksPerAction([{ level }], edition, () => carrier);
}

describe("deriveAttacksPerAction against the REAL seeded Fighter rows (#1530)", () => {
  it("2/3/4 at levels 5/11/20, in BOTH editions, from the base-class row", async () => {
    for (const edition of EDITIONS) {
      expect(await attacksAt("fighter", undefined, 4, edition)).toBe(1);
      expect(await attacksAt("fighter", undefined, 5, edition)).toBe(2);
      expect(await attacksAt("fighter", undefined, 11, edition)).toBe(3);
      expect(await attacksAt("fighter", undefined, 20, edition)).toBe(4);
    }
  });

  // 2024 also seeds "Two Extra Attacks"/"Three Extra Attacks" as separate
  // text-only rows (#1528) — this proves they don't ALSO contribute via
  // derivedStat (which would double the base row's tier instead of
  // agreeing with it, since derivedStatFromRows takes the max).
  it("2024's decomposed Two/Three Extra Attacks rows don't change the result", async () => {
    expect(await attacksAt("fighter", undefined, 11, "EDITION_2024")).toBe(3);
    expect(await attacksAt("fighter", undefined, 20, "EDITION_2024")).toBe(4);
  });
});

describe("deriveAttacksPerAction against REAL seeded Barbarian/Monk/Paladin/Ranger rows", () => {
  for (const className of ["barbarian", "monk", "paladin", "ranger"]) {
    it(`${className}: 1 below L5, 2 at L5+ with no further scaling, both editions`, async () => {
      for (const edition of EDITIONS) {
        expect(await attacksAt(className, undefined, 4, edition)).toBe(1);
        expect(await attacksAt(className, undefined, 5, edition)).toBe(2);
        expect(await attacksAt(className, undefined, 20, edition)).toBe(2);
      }
    });
  }
});

describe("deriveAttacksPerAction against the REAL seeded College of Valor row (subclass-gated)", () => {
  it("bard/College of Valor: 2 at bard level 6, not before, both editions", async () => {
    for (const edition of EDITIONS) {
      expect(await attacksAt("bard", "college of valor", 5, edition)).toBe(1);
      expect(await attacksAt("bard", "college of valor", 6, edition)).toBe(2);
    }
  });

  it("bard/College of Lore never gets Extra Attack", async () => {
    expect(await attacksAt("bard", "college of lore", 20, "EDITION_2024")).toBe(1);
  });

  it("bard base class (no subclass) never gets Extra Attack", async () => {
    expect(await attacksAt("bard", undefined, 20, "EDITION_2024")).toBe(1);
  });
});
