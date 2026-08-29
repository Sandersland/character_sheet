import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { RANGER_FEATURES } from "../ranger-features.js";

const BASE_ROWS = RANGER_FEATURES.filter((r) => r.subclassSlug === null);

function poolAt(key: string, level: number, edition: "EDITION_2014" | "EDITION_2024", abilityScores: Record<string, number> = {}) {
  return poolsFromRows(BASE_ROWS, level, abilityScores, 0, edition).find((p) => p.key === key);
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

  // Favored Enemy's tier value equals proficiencyBonusForLevel(level) by coincidence, not by rule — see ranger-features.ts's own comment on this row.
  it("coincidentally equals proficiencyBonusForLevel(level) at every level 1-20 (not a rule — see the row's own comment)", () => {
    for (let level = 1; level <= 20; level++) {
      expect(poolAt("favoredEnemy", level, "EDITION_2024")?.total, `level ${level}`).toBe(proficiencyBonusForLevel(level));
    }
  });
});

describe("Tireless / Nature's Veil (#1230, migrated onto their rows by #1685): { abilityMod: \"wisdom\", min: 1 } formula tiers — poolsFromRows alone resolves both, no resourceFn left in ranger.ts", () => {
  it("tireless: absent below level 10 and under EDITION_2014; present at level 10+ with the Wisdom-modifier total (floored at 1), longRest recharge", () => {
    expect(poolAt("tireless", 9, "EDITION_2024", { wisdom: 18 })).toBeUndefined();
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      if (edition === "EDITION_2014") {
        expect(poolAt("tireless", 20, edition, { wisdom: 18 })).toBeUndefined();
        continue;
      }
      const low = poolAt("tireless", 10, edition, { wisdom: 8 });
      expect(low?.total).toBe(1);
      expect(low?.recharge).toBe("longRest");
      expect(poolAt("tireless", 10, edition, { wisdom: 18 })?.total).toBe(4);
    }
  });

  it("naturesVeil: absent below level 14 and under EDITION_2014; present at level 14+ with the Wisdom-modifier total (floored at 1), longRest recharge", () => {
    expect(poolAt("naturesVeil", 13, "EDITION_2024", { wisdom: 18 })).toBeUndefined();
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      if (edition === "EDITION_2014") {
        expect(poolAt("naturesVeil", 20, edition, { wisdom: 18 })).toBeUndefined();
        continue;
      }
      const low = poolAt("naturesVeil", 14, edition, { wisdom: 8 });
      expect(low?.total).toBe(1);
      expect(low?.recharge).toBe("longRest");
      expect(poolAt("naturesVeil", 14, edition, { wisdom: 18 })?.total).toBe(4);
    }
  });
});
