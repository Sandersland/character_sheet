// #1225 commit 3: the Channel Divinity resource pool moved off
// lib/classes/cleric.ts's retired resourceFn onto its two carrier rows —
// 2014's "Channel Divinity: Turn Undead" row and 2024's "Channel Divinity"
// row (see cleric-features.ts's own RESOURCE POOL header block for why each
// pool rides its particular row). Read here through the SAME poolsFromRows a
// real character's derivation calls (registry.ts's deriveBaseLayer), never a
// hand-rolled re-derivation of the tier table. Modelled on
// barbarian-rage-pool.test.ts / warlock-resource-pools.test.ts.
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";

import { CLERIC_FEATURES } from "../cleric-features.js";

const BASE_ROWS = CLERIC_FEATURES.filter((r) => r.subclassSlug === null);

function poolAt(level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsFromRows(BASE_ROWS, level, edition).find((p) => p.key === "channelDivinity");
}

describe("Channel Divinity pool — exactly one row per edition declares resourceKey: \"channelDivinity\" (#1225)", () => {
  it("2014: only the 'Channel Divinity: Turn Undead' row sets it", () => {
    const rows2014 = BASE_ROWS.filter((r) => r.edition === "EDITION_2014" && r.resourceKey === "channelDivinity");
    expect(rows2014).toHaveLength(1);
    expect(rows2014[0].name).toBe("Channel Divinity: Turn Undead");
  });

  it("2024: only the 'Channel Divinity' row sets it", () => {
    const rows2024 = BASE_ROWS.filter((r) => r.edition === "EDITION_2024" && r.resourceKey === "channelDivinity");
    expect(rows2024).toHaveLength(1);
    expect(rows2024[0].name).toBe("Channel Divinity");
  });
});

describe("Channel Divinity pool — 2014 tiers: 1/2/3 at L2/6/18, short-or-long, no shortRestRegain (SRD 5.1)", () => {
  it("absent at level 1", () => {
    expect(poolAt(1, "EDITION_2014")).toBeUndefined();
  });

  const TIERS_2014: [level: number, total: number][] = [
    [2, 1],
    [5, 1],
    [6, 2],
    [17, 2],
    [18, 3],
    [20, 3],
  ];
  it.each(TIERS_2014)("level %i -> total %i", (level, total) => {
    expect(poolAt(level, "EDITION_2014")?.total).toBe(total);
  });

  it("recharge is short-or-long, and no tier sets shortRestRegain", () => {
    for (const level of [2, 6, 18]) {
      const pool = poolAt(level, "EDITION_2014");
      expect(pool?.recharge, `level ${level}`).toBe("short-or-long");
      expect(pool?.shortRestRegain, `level ${level}`).toBeUndefined();
    }
  });

  it("key/label", () => {
    const pool = poolAt(6, "EDITION_2014")!;
    expect(pool.key).toBe("channelDivinity");
    expect(pool.label).toBe("Channel Divinity");
  });
});

// The headline bug this issue fixes: pre-#1225, a 2024 Cleric's pool still
// came from the edition-blind resourceFn, so a level-20 2024 Cleric derived
// total 3 (the 2014 table) instead of the real SRD 5.2 4, and a level-2 2024
// Cleric derived 1 instead of the real 2.
describe("Channel Divinity pool — 2024 tiers: 2/3/4 at L2/6/18, longRest, shortRestRegain 1 on every tier (SRD 5.2)", () => {
  it("absent at level 1", () => {
    expect(poolAt(1, "EDITION_2024")).toBeUndefined();
  });

  const TIERS_2024: [level: number, total: number][] = [
    [2, 2],
    [5, 2],
    [6, 3],
    [17, 3],
    [18, 4],
    [20, 4],
  ];
  it.each(TIERS_2024)("level %i -> total %i", (level, total) => {
    expect(poolAt(level, "EDITION_2024")?.total).toBe(total);
  });

  it("a level-20 2024 Cleric derives total 4, not the retired 2014-shaped 3", () => {
    expect(poolAt(20, "EDITION_2024")?.total).toBe(4);
    expect(poolAt(20, "EDITION_2024")?.total).not.toBe(3);
  });

  it("a level-2 2024 Cleric derives total 2, not the retired 2014-shaped 1", () => {
    expect(poolAt(2, "EDITION_2024")?.total).toBe(2);
    expect(poolAt(2, "EDITION_2024")?.total).not.toBe(1);
  });

  it("recharge is longRest, and every tier sets shortRestRegain: 1", () => {
    for (const level of [2, 6, 18]) {
      const pool = poolAt(level, "EDITION_2024");
      expect(pool?.recharge, `level ${level}`).toBe("longRest");
      expect(pool?.shortRestRegain, `level ${level}`).toBe(1);
    }
  });

  it("key/label", () => {
    const pool = poolAt(6, "EDITION_2024")!;
    expect(pool.key).toBe("channelDivinity");
    expect(pool.label).toBe("Channel Divinity");
  });
});
