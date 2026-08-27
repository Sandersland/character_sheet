import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { PALADIN_FEATURES } from "../paladin-features.js";

const BASE_ROWS = PALADIN_FEATURES.filter((r) => r.subclassSlug === null);

function poolAt(key: string, level: number, edition: "EDITION_2014" | "EDITION_2024", charisma: number) {
  return poolsFromRows(BASE_ROWS, level, { charisma }, 0, edition).find((p) => p.key === key);
}

// PHB'14 p.84: 1 + your Charisma modifier, EDITION_2014-only — 2024 removed
// Divine Sense as its own pool (its job moves to the Channel Divinity option
// "Channel Divinity: Divine Sense" instead, spending the channelDivinity
// pool). The `plus` additive term (#1685's evaluator, widened for this retab)
// is what expresses the offset.
describe("divineSense rides Paladin's own row — the pool the deleted paladin resourceFn used to declare", () => {
  it("total is 1 + Cha modifier, floored at 1 — Cha 8 (-1 mod) floors to 1, Cha 18 (+4 mod) is 5", () => {
    expect(poolAt("divineSense", 1, "EDITION_2014", 8)?.total).toBe(1);
    expect(poolAt("divineSense", 1, "EDITION_2014", 18)?.total).toBe(5);
  });

  it("recharges on a long rest, present from level 1 (grant IS level 1)", () => {
    expect(poolAt("divineSense", 1, "EDITION_2014", 10)?.recharge).toBe("longRest");
    expect(poolAt("divineSense", 1, "EDITION_2014", 10)?.label).toBe("Divine Sense");
    expect(poolAt("divineSense", 20, "EDITION_2014", 10)?.total).toBe(1 + 0); // Cha 10, +0 mod, floored to 1
  });

  it("absent entirely under EDITION_2024 (no 2024 row declares this key — folded into Channel Divinity: Divine Sense)", () => {
    expect(poolAt("divineSense", 20, "EDITION_2024", 18)).toBeUndefined();
  });

  // #1528 no-second-string rule: the pool's description is the row's own
  // text, never a second, formula-interpolated string.
  it("the row's own description IS the pool's description", () => {
    const row = BASE_ROWS.find((r) => r.name === "Divine Sense" && r.edition === "EDITION_2014")!;
    expect(poolAt("divineSense", 1, "EDITION_2014", 10)?.description).toBe(row.description);
  });

  it("deriveResources yields total 4 (Cha 16, +3 mod, +1) for divineSense, EDITION_2014 only", () => {
    const abilityScores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 13, charisma: 16 };
    const profBonus = proficiencyBonusForLevel(3);
    const info2014 = deriveResources("paladin", undefined, 3, abilityScores, profBonus, { classRows: BASE_ROWS, subclassRows: [] }, "EDITION_2014");
    expect(info2014?.resources.find((r) => r.key === "divineSense")?.total).toBe(4);
    const info2024 = deriveResources("paladin", undefined, 3, abilityScores, profBonus, { classRows: BASE_ROWS, subclassRows: [] }, "EDITION_2024");
    expect(info2024?.resources.find((r) => r.key === "divineSense")).toBeUndefined();
  });
});

// PHB'14 p.84 / SRD 5.2: a pool of 5 × Paladin level, both editions, longRest.
describe("layOnHands rides Paladin's own row — the pool the deleted paladin resourceFn used to declare", () => {
  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: total is 5 x level, longRest recharge, for every level 1-20", (edition) => {
    for (let level = 1; level <= 20; level++) {
      const pool = poolAt("layOnHands", level, edition, 10);
      expect(pool?.label, `${edition} L${level}`).toBe("Lay on Hands");
      expect(pool?.total, `${edition} L${level}`).toBe(level * 5);
      expect(pool?.recharge, `${edition} L${level}`).toBe("longRest");
    }
  });

  it("each edition's pool description is its own Lay on Hands row text", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const row = BASE_ROWS.find((r) => r.name === "Lay on Hands" && r.edition === edition)!;
      expect(poolAt("layOnHands", 1, edition, 10)?.description).toBe(row.description);
    }
  });

  it("deriveResources yields total 15 (level 3 x 5) for layOnHands, both editions", () => {
    const abilityScores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 13, charisma: 16 };
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const profBonus = proficiencyBonusForLevel(3);
      const info = deriveResources("paladin", undefined, 3, abilityScores, profBonus, { classRows: BASE_ROWS, subclassRows: [] }, edition);
      const pool = info?.resources.find((r) => r.key === "layOnHands");
      expect(pool?.total, edition).toBe(15);
    }
  });
});
