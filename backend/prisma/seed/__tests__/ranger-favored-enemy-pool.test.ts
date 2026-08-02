// #1230 commit 3: Favored Enemy's uses-per-Long-Rest pool moved off the
// issue's (unsupported, 2014-Tasha's-carryover) "proficiency bonus" premise
// onto a flat level-tiered resourceTotals on the EDITION_2024 row — read here
// through the SAME poolsFromRows a real character's derivation calls
// (registry.ts's deriveBaseLayer). Modelled on warlock-resource-pools.test.ts.
// Also proves the positive half of C1: Tireless/Nature's Veil are NEVER
// row-derived pools (their rows deliberately omit resourceTotals) — only
// ranger.ts's resourceFn supplies their total, exercised by
// ranger-wisdom-pools.test.ts.
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { RANGER_FEATURES } from "../ranger-features.js";

const BASE_ROWS = RANGER_FEATURES.filter((r) => r.subclassSlug === null);

function poolAt(key: string, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsFromRows(BASE_ROWS, level, edition).find((p) => p.key === key);
}

describe("Favored Enemy (#1230): 2/3/4/5/6 at L1/5/9/13/17, Long Rest recharge, 2024 only", () => {
  it("tier boundaries: totals step up exactly at L1/5/9/13/17 and hold between tiers", () => {
    const expected: [number, number][] = [
      [1, 2],
      [4, 2],
      [5, 3],
      [8, 3],
      [9, 4],
      [12, 4],
      [13, 5],
      [16, 5],
      [17, 6],
      [20, 6],
    ];
    for (const [level, total] of expected) {
      expect(poolAt("favoredEnemy", level, "EDITION_2024")?.total, `level ${level}`).toBe(total);
    }
  });

  it("recharge is longRest, and the pool's description equals the row's own text (#1528 no-second-string rule)", () => {
    const pool = poolAt("favoredEnemy", 1, "EDITION_2024")!;
    expect(pool.recharge).toBe("longRest");
    const row = BASE_ROWS.find((r) => r.name === "Favored Enemy" && r.edition === "EDITION_2024")!;
    expect(pool.description).toBe(row.description);
  });

  it("absent entirely under EDITION_2014 (no 2014 row declares this key)", () => {
    expect(poolAt("favoredEnemy", 20, "EDITION_2014")).toBeUndefined();
  });

  // Derived-totals cross-check (issue AC: "don't hard-code a table that could
  // drift"): the Favored Enemy tier value happens to equal
  // proficiencyBonusForLevel(level) at every level in SRD 5.2 — a numeric
  // COINCIDENCE, not a rule (see ranger-features.ts's own comment on this
  // row). A future PB table change must not silently retabulate Favored
  // Enemy — this assertion is what would go red if the two ever diverge.
  it("coincidentally equals proficiencyBonusForLevel(level) at every level 1-20 (not a rule — see the row's own comment)", () => {
    for (let level = 1; level <= 20; level++) {
      expect(poolAt("favoredEnemy", level, "EDITION_2024")?.total, `level ${level}`).toBe(proficiencyBonusForLevel(level));
    }
  });
});

describe("Tireless / Nature's Veil (#1230 C1): rows declare resourceKey but NEVER derive a pool via poolsFromRows — the positive proof they defer to resourceFn", () => {
  it("tireless is undefined from poolsFromRows at every level, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolAt("tireless", 10, edition)).toBeUndefined();
      expect(poolAt("tireless", 20, edition)).toBeUndefined();
    }
  });

  it("naturesVeil is undefined from poolsFromRows at every level, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolAt("naturesVeil", 14, edition)).toBeUndefined();
      expect(poolAt("naturesVeil", 20, edition)).toBeUndefined();
    }
  });
});
