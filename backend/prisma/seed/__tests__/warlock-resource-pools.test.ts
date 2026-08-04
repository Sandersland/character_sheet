// #1233 commit 3: every Warlock pool that is a flat, level-tiered total moved
// off lib/classes/warlock.ts's resourceFns onto its ClassFeature row's own
// resourceKey/resourceLabel/resourceRecharge/resourceTotals columns, read here
// through the SAME poolsFromRows a real character's derivation calls
// (registry.ts's deriveBaseLayer/deriveSubclassLayer) — never a hand-rolled
// re-derivation of the tier table. Modelled on barbarian-rage-pool.test.ts.
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";

import { WARLOCK_FEATURES } from "../warlock-features.js";

const BASE_ROWS = WARLOCK_FEATURES.filter((r) => r.subclassSlug === null);
const FIEND_ROWS = WARLOCK_FEATURES.filter((r) => r.subclassSlug === "warlock-the-fiend");
const ARCHFEY_ROWS = WARLOCK_FEATURES.filter((r) => r.subclassSlug === "warlock-the-archfey");
const GOO_ROWS = WARLOCK_FEATURES.filter((r) => r.subclassSlug === "warlock-the-great-old-one");

// abilityScores/profBonus default to `{}`/`0`; darkOnesOwnLuckPoolAt below
// overrides abilityScores for the one #1685 formula-shaped pool this file
// covers.
function poolAt(
  rows: typeof WARLOCK_FEATURES,
  key: string,
  level: number,
  edition: "EDITION_2014" | "EDITION_2024",
  abilityScores: Record<string, number> = {},
) {
  return poolsFromRows(rows, level, abilityScores, 0, edition).find((p) => p.key === key);
}

describe("Magical Cunning (base class, #1233): 2024 only, L2, 1/long rest", () => {
  it("absent at level 1, present at level 2 and level 20", () => {
    expect(poolAt(BASE_ROWS, "magicalCunning", 1, "EDITION_2024")).toBeUndefined();
    const at2 = poolAt(BASE_ROWS, "magicalCunning", 2, "EDITION_2024");
    expect(at2?.total).toBe(1);
    expect(at2?.recharge).toBe("longRest");
    expect(at2?.label).toBe("Magical Cunning");
    expect(at2?.description).toContain("half your maximum");
    expect(poolAt(BASE_ROWS, "magicalCunning", 20, "EDITION_2024")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2014 (no 2014 row declares this key)", () => {
    expect(poolAt(BASE_ROWS, "magicalCunning", 20, "EDITION_2014")).toBeUndefined();
  });

  it("the row's own description IS the pool's description (#1528 no-second-string rule)", () => {
    const row = BASE_ROWS.find((r) => r.name === "Magical Cunning" && r.edition === "EDITION_2024")!;
    const pool = poolAt(BASE_ROWS, "magicalCunning", 2, "EDITION_2024")!;
    expect(pool.description).toBe(row.description);
  });
});

describe("Dark One's Own Luck (The Fiend, #1233): 2014 flat 1 short-or-long; 2024 defers its total (row omits resourceTotals)", () => {
  it("EDITION_2014: absent at level 5, present at level 6 and level 20, short-or-long recharge", () => {
    expect(poolAt(FIEND_ROWS, "darkOnesOwnLuck", 5, "EDITION_2014")).toBeUndefined();
    const at6 = poolAt(FIEND_ROWS, "darkOnesOwnLuck", 6, "EDITION_2014");
    expect(at6?.total).toBe(1);
    expect(at6?.recharge).toBe("short-or-long");
    expect(poolAt(FIEND_ROWS, "darkOnesOwnLuck", 20, "EDITION_2014")?.total).toBe(1);
  });

  it("EDITION_2024: the row itself never derives a pool — resourceTotals is omitted, proving the row deliberately defers to resourceFn", () => {
    expect(poolAt(FIEND_ROWS, "darkOnesOwnLuck", 6, "EDITION_2024")).toBeUndefined();
    expect(poolAt(FIEND_ROWS, "darkOnesOwnLuck", 20, "EDITION_2024")).toBeUndefined();
  });
});

describe("Hurl Through Hell (The Fiend, #1233): identical resourceTotals/recharge across both editions, L14", () => {
  it("both editions: absent at level 13, present at level 14 and level 20, longRest recharge", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolAt(FIEND_ROWS, "hurlThroughHell", 13, edition)).toBeUndefined();
      const at14 = poolAt(FIEND_ROWS, "hurlThroughHell", 14, edition);
      expect(at14?.total, edition).toBe(1);
      expect(at14?.recharge, edition).toBe("longRest");
      expect(poolAt(FIEND_ROWS, "hurlThroughHell", 20, edition)?.total, edition).toBe(1);
    }
  });

  it("edition split: 2024 description contains 8d10, 2014 contains 10d10", () => {
    expect(poolAt(FIEND_ROWS, "hurlThroughHell", 14, "EDITION_2024")?.description).toContain("8d10");
    expect(poolAt(FIEND_ROWS, "hurlThroughHell", 14, "EDITION_2014")?.description).toContain("10d10");
  });
});

describe("The Archfey's three pools (EDITION_2014 only, #1233): each row's own level replaces the old if(level>=N) gate", () => {
  it("Fey Presence: present from level 1 (its own grant level)", () => {
    expect(poolAt(ARCHFEY_ROWS, "feyPresence", 1, "EDITION_2014")?.total).toBe(1);
    expect(poolAt(ARCHFEY_ROWS, "feyPresence", 1, "EDITION_2014")?.recharge).toBe("short-or-long");
  });

  it("Misty Escape: absent at level 5, present at level 6", () => {
    expect(poolAt(ARCHFEY_ROWS, "mistyEscape", 5, "EDITION_2014")).toBeUndefined();
    expect(poolAt(ARCHFEY_ROWS, "mistyEscape", 6, "EDITION_2014")?.total).toBe(1);
  });

  it("Dark Delirium: absent at level 13, present at level 14", () => {
    expect(poolAt(ARCHFEY_ROWS, "darkDelirium", 13, "EDITION_2014")).toBeUndefined();
    expect(poolAt(ARCHFEY_ROWS, "darkDelirium", 14, "EDITION_2014")?.total).toBe(1);
  });

  it("all three pools are absent under EDITION_2024 (zero 2024 rows authored for this patron)", () => {
    expect(poolAt(ARCHFEY_ROWS, "feyPresence", 20, "EDITION_2024")).toBeUndefined();
    expect(poolAt(ARCHFEY_ROWS, "mistyEscape", 20, "EDITION_2024")).toBeUndefined();
    expect(poolAt(ARCHFEY_ROWS, "darkDelirium", 20, "EDITION_2024")).toBeUndefined();
  });
});

describe("The Great Old One's one pool (EDITION_2014 only, #1233)", () => {
  it("Entropic Ward: absent at level 5, present at level 6 and level 20, short-or-long recharge", () => {
    expect(poolAt(GOO_ROWS, "entropicWard", 5, "EDITION_2014")).toBeUndefined();
    const at6 = poolAt(GOO_ROWS, "entropicWard", 6, "EDITION_2014");
    expect(at6?.total).toBe(1);
    expect(at6?.recharge).toBe("short-or-long");
    expect(poolAt(GOO_ROWS, "entropicWard", 20, "EDITION_2014")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2024", () => {
    expect(poolAt(GOO_ROWS, "entropicWard", 20, "EDITION_2024")).toBeUndefined();
  });
});
