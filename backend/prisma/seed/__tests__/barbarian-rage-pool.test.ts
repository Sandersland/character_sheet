// #1223 commit 3: Rage's resource pool (uses-per-rest total/recharge) moves
// off lib/classes/barbarian.ts's retired resourceFn (rageCountForLevel) onto
// the two Rage ClassFeature rows in barbarian-features.ts, read here through
// the SAME poolsFromRows a real character's derivation calls (registry.ts's
// deriveBaseLayer) — never a hand-rolled re-derivation of the tier table.
//
// The headline bug (#1223): SRD 5.1 grants unlimited Rages at level 20
// (encoded as 99, the pre-existing codebase convention); SRD 5.2 caps at 6
// from level 17 on, with NO L20 tier. Before this commit, both editions'
// Rage row carried no resourceKey at all, so poolsFromRows returned nothing
// for either — the bug lived in the retired barbarian.ts resourceFn instead
// (rageCountForLevel(20) === 99 for BOTH editions, since resourceFn ignored
// `edition` entirely). This file is red until the two Rage rows' resource
// columns are populated to the split table below.
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";

import { BARBARIAN_FEATURES } from "../barbarian-features.js";

// Base-class rows only (subclassSlug null) — mirrors the `classRows` half of
// the real ClassFeatureRowsCarrier a Barbarian's own class.features relation
// loads (characterInclude; subclassId: null).
const BASE_ROWS = BARBARIAN_FEATURES.filter((r) => r.subclassSlug === null);

function ragePoolAt(level: number, edition: "EDITION_2014" | "EDITION_2024") {
  const pools = poolsFromRows(BASE_ROWS, level, edition);
  return pools.find((p) => p.key === "rage");
}

describe("Rage pool — the headline #1223 bug: 2024 caps at 6, 2014 keeps unlimited (99) at level 20", () => {
  it("EDITION_2024 level 20: total is 6, not 99 (no L20 tier — SRD 5.2 p.20 caps at level 17's 6)", () => {
    const pool = ragePoolAt(20, "EDITION_2024");
    expect(pool?.total).toBe(6);
  });

  it("EDITION_2014 level 20: total is 99 (SRD 5.1 p.21 unlimited, this codebase's existing 99 encoding) — unaffected by the 2024 fix", () => {
    const pool = ragePoolAt(20, "EDITION_2014");
    expect(pool?.total).toBe(99);
  });

  it("a regression in either direction is caught: 2024 must not silently gain the 2014 tier back, and 2014 must not silently lose it", () => {
    expect(ragePoolAt(20, "EDITION_2024")?.total).not.toBe(99);
    expect(ragePoolAt(20, "EDITION_2014")?.total).not.toBe(6);
  });
});

describe("Rage pool — tier-boundary coverage, both editions, at every published breakpoint", () => {
  const TIERS_2014: [level: number, total: number][] = [
    [1, 2],
    [3, 3],
    [6, 4],
    [12, 5],
    [17, 6],
    [20, 99],
  ];
  const TIERS_2024: [level: number, total: number][] = [
    [1, 2],
    [3, 3],
    [6, 4],
    [12, 5],
    [17, 6],
    // No level-20 entry: 17's tier (6) still applies (last-match-wins, ascending).
  ];

  it.each(TIERS_2014)("EDITION_2014 level %i -> total %i", (level, total) => {
    expect(ragePoolAt(level, "EDITION_2014")?.total).toBe(total);
  });

  it.each(TIERS_2024)("EDITION_2024 level %i -> total %i", (level, total) => {
    expect(ragePoolAt(level, "EDITION_2024")?.total).toBe(total);
  });

  it("EDITION_2024 level 20 still resolves to the level-17 tier (6), not a dropped/undefined pool", () => {
    expect(ragePoolAt(20, "EDITION_2024")?.total).toBe(6);
  });

  it("one level below the first tier (level 0 is impossible, but level 1 is the floor): no pool below level 1 is meaningless — both editions' floor tier is minLevel 1", () => {
    expect(ragePoolAt(1, "EDITION_2014")?.total).toBe(2);
    expect(ragePoolAt(1, "EDITION_2024")?.total).toBe(2);
  });
});

describe("Rage pool — recharge + shortRestRegain shape", () => {
  it("EDITION_2014: longRest recharge, no shortRestRegain on any tier (SRD 5.1: long rest only)", () => {
    for (const level of [1, 3, 6, 12, 17, 20]) {
      const pool = ragePoolAt(level, "EDITION_2014");
      expect(pool?.recharge, `level ${level}`).toBe("longRest");
      expect(pool?.shortRestRegain, `level ${level}`).toBeUndefined();
    }
  });

  it("EDITION_2024: longRest recharge, shortRestRegain 1 on every reached tier (SRD 5.2 p.20 partial short-rest top-up)", () => {
    for (const level of [1, 3, 6, 12, 17, 20]) {
      const pool = ragePoolAt(level, "EDITION_2024");
      expect(pool?.recharge, `level ${level}`).toBe("longRest");
      expect(pool?.shortRestRegain, `level ${level}`).toBe(1);
    }
  });
});
