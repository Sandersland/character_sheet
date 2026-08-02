import { describe, expect, it } from "vitest";

import { bard } from "@/lib/classes/bard.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { testFeatureRowsFor } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { deriveSpellcasting, type DerivedSpellcastingInfo } from "@/lib/srd/srd.js";

// Ability scores with distinct INT/WIS/CHA mods so tests can assert the right
// governing ability is used: INT 12 (+1), WIS 14 (+2), CHA 16 (+3).
const CASTER_SCORES = {
  strength: 10, dexterity: 10, constitution: 10,
  intelligence: 12, wisdom: 14, charisma: 16,
};

/** Flattens slotTotals into a { [level]: total } map for terse assertions. */
function slotMap(info: DerivedSpellcastingInfo | null): Record<number, number> {
  return Object.fromEntries((info?.slotTotals ?? []).map((s) => [s.level, s.total]));
}

const ABILITY_SCORES = {
  strength: 16, dexterity: 10, constitution: 14,
  intelligence: 10, wisdom: 10, charisma: 10,
};
const PROF_2 = 2;
const PROF_3 = 3; // proficiency at level 5+

// ── Unknown / empty classes ────────────────────────────────────────────────────

describe("deriveResources — unknown class", () => {
  it("returns null for a completely unknown class with no subclass", () => {
    expect(deriveResources("artificer", undefined, 5, ABILITY_SCORES, PROF_2, testFeatureRowsFor("artificer", undefined), "EDITION_2024")).toBeNull();
  });

  it("returns null for an unknown class even with an unrecognised subclass", () => {
    expect(deriveResources("artificer", "alchemist", 5, ABILITY_SCORES, PROF_2, testFeatureRowsFor("artificer", "alchemist"), "EDITION_2024")).toBeNull();
  });
});

// ── Battle Master subclass layer gating ───────────────────────────────────────
// After the base-class merge, Fighter always has features (Second Wind, etc.)
// even below grant level 3. These tests verify the *subclass* layer specifically.

describe("deriveResources — Battle Master subclass gating", () => {
  it("does not include superiorityDice below grant level 3", () => {
    const result = deriveResources("fighter", "battle master", 2, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    // Fighter L2 has base features + pools (Second Wind, Action Surge)
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("superiorityDice");
  });

  it("includes superiorityDice at grant level 3", () => {
    const result = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).toContain("superiorityDice");
  });

  it("still returns non-null for a Fighter below subclass grant level (base pools present)", () => {
    const result = deriveResources("fighter", "battle master", 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(result).not.toBeNull();
    // Asserts on `.resources`, not `.features` (#1227): testFeatureRowsFor's
    // TS-sourced fixture always returns EMPTY feature rows for Fighter now —
    // its text lives in literal seed data (prisma/seed/fighter-features.ts),
    // which this src-side fixture can't import (rootDir boundary, see the
    // fixture's own header). Non-null here comes from the base pools
    // (Second Wind, at minimum) resourceFn still returns unconditionally.
    expect(result!.resources.length).toBeGreaterThan(0);
  });

  it("returns null for a fully unknown subclass on a known class only if class has no data", () => {
    // Fighter has base data, so a purple dragon knight returns non-null (base Fighter features)
    const result = deriveResources("fighter", "purple dragon knight", 5, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", "purple dragon knight"), "EDITION_2024");
    expect(result).not.toBeNull();
    // But the unrecognised subclass itself contributes nothing
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("superiorityDice");
  });

  it("sets maneuverChoiceCount and maneuverSaveDC at level 3", () => {
    const result = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", "battle master"), "EDITION_2024");
    expect(result!.maneuverChoiceCount).toBe(3);
    // STR mod +3, DEX mod 0, prof 2 → DC = 8 + 2 + 3 = 13
    expect(result!.maneuverSaveDC).toBe(13);
    expect(result!.toolProfChoiceCount).toBe(1);
  });
});

// ── Druid — Wild Shape base pool ──────────────────────────────────────────────
// #1226 retarget: these cases used to pass "EDITION_2024" while asserting SRD
// 5.1 values (flat 2, then a >10 "unlimited" sentinel at level 20) — the
// stale-copy state #1226 exists to fix. Retargeted to EDITION_2014 verbatim
// (now the 2014 regression guard, druid.ts's resourceFn untouched); the
// EDITION_2024 sibling below asserts the real 2/3/4 SRD 5.2 tier table,
// authored onto the Wild Shape row itself (#1226 commit 3).

describe("deriveResources — Druid Wild Shape, EDITION_2014", () => {
  it("returns no wildShape pool below level 2", () => {
    const result = deriveResources("druid", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", undefined), "EDITION_2014");
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("wildShape");
  });

  it("returns 2 wildShape uses at level 2", () => {
    const result = deriveResources("druid", undefined, 2, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", undefined), "EDITION_2014");
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws).toBeDefined();
    expect(ws!.total).toBe(2);
    expect(ws!.recharge).toBe("short-or-long");
  });

  it("returns 2 wildShape uses through level 19", () => {
    const result = deriveResources("druid", undefined, 10, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", undefined), "EDITION_2014");
    expect(result!.resources.find((r) => r.key === "wildShape")!.total).toBe(2);
  });

  it("returns sentinel value at level 20 (Archdruid)", () => {
    const result = deriveResources("druid", undefined, 20, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", undefined), "EDITION_2014");
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws!.total).toBeGreaterThan(10); // unlimited sentinel
  });

  it("Circle of the Moon shares the base wildShape pool (no duplicate)", () => {
    const result = deriveResources("druid", "circle of the moon", 6, ABILITY_SCORES, PROF_3, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2014");
    const wsPools = result!.resources.filter((r) => r.key === "wildShape");
    expect(wsPools.length).toBe(1); // exactly one — no duplicate from subclass
  });

  // Level 3 is above the gate, not at it: EDITION_2014's Circle of the Moon
  // grants at 2 (druid.ts's grantLevel, PHB'14 p.66). druid-wildshape-cr.test.ts
  // owns the level-2 boundary itself.
  it("Circle of the Moon contributes features (Combat Wild Shape, Circle Forms) above its level-2 grant (#1128)", () => {
    const result = deriveResources("druid", "circle of the moon", 3, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2014");
    const featureNames = result!.features.map((f) => f.name);
    expect(featureNames).toContain("Combat Wild Shape");
    expect(featureNames).toContain("Circle Forms");
  });
});

describe("deriveResources — Druid Wild Shape, EDITION_2024 (#1226): 2/3/4 tiers, longRest recharge, no unlimited sentinel", () => {
  it("returns no wildShape pool below level 2", () => {
    const result = deriveResources("druid", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", undefined), "EDITION_2024");
    expect(result).not.toBeNull();
    expect(result!.resources.map((r) => r.key)).not.toContain("wildShape");
  });

  it("returns 2 wildShape uses at level 2, recharge longRest", () => {
    const result = deriveResources("druid", undefined, 2, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", undefined), "EDITION_2024");
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws).toBeDefined();
    expect(ws!.total).toBe(2);
    expect(ws!.recharge).toBe("longRest");
    expect(ws!.shortRestRegain).toBe(1);
  });

  it("returns 3 wildShape uses at level 6, through level 16", () => {
    const result = deriveResources("druid", undefined, 10, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "wildShape")!.total).toBe(3);
  });

  it("returns 4 wildShape uses at level 20 — no unlimited sentinel", () => {
    const result = deriveResources("druid", undefined, 20, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", undefined), "EDITION_2024");
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws!.total).toBe(4);
  });

  it("Circle of the Moon shares the base wildShape pool (no duplicate)", () => {
    const result = deriveResources("druid", "circle of the moon", 6, ABILITY_SCORES, PROF_3, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2024");
    const wsPools = result!.resources.filter((r) => r.key === "wildShape");
    expect(wsPools.length).toBe(1);
  });

  it("Circle of the Moon contributes features (Circle Forms, Circle of the Moon Spells) at its level-3 grant", () => {
    const result = deriveResources("druid", "circle of the moon", 3, ABILITY_SCORES, PROF_2, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2024");
    const featureNames = result!.features.map((f) => f.name);
    expect(featureNames).toContain("Circle Forms");
    expect(featureNames).toContain("Circle of the Moon Spells");
    expect(featureNames).not.toContain("Combat Wild Shape");
  });

  it("Moonlight Step's pool appears only at level 10+, absent below", () => {
    const below = deriveResources("druid", "circle of the moon", 9, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2024");
    const at10 = deriveResources("druid", "circle of the moon", 10, ABILITY_SCORES, PROF_4, testFeatureRowsFor("druid", "circle of the moon"), "EDITION_2024");
    expect(below!.resources.map((r) => r.key)).not.toContain("moonlightStep");
    expect(at10!.resources.map((r) => r.key)).toContain("moonlightStep");
  });
});

// ── Barbarian — Rage ──────────────────────────────────────────────────────────
// #1223: the level 1-19 tier table is IDENTICAL in both editions, but level 20
// forks — SRD 5.1 keeps the 99 "unlimited" sentinel (long rest only, no
// shortRestRegain); SRD 5.2 p.20 caps at 6 (the level-17 tier still applies)
// and adds shortRestRegain: 1 on every tier. Before this issue, both editions
// resolved barbarian.ts's single edition-blind resourceFn, so a 2024
// character's level-20 sheet wrongly showed "Unlimited uses at level 20" —
// the headline bug this test used to encode as EXPECTED (>10) rather than
// catch; it now asserts the fixed, edition-split values instead.

describe("deriveResources — Barbarian Rage (both editions agree on levels 1-19)", () => {
  const PROF_4 = 4;

  it.each([
    [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [9, 4], [11, 4], [12, 5], [16, 5], [17, 6], [19, 6],
  ])("EDITION_2024 level %i → %i rage uses", (level, expectedTotal) => {
    const result = deriveResources("barbarian", undefined, level, ABILITY_SCORES, PROF_2, testFeatureRowsFor("barbarian", undefined), "EDITION_2024");
    const rage = result!.resources.find((r) => r.key === "rage");
    expect(rage!.total).toBe(expectedTotal);
    expect(rage!.recharge).toBe("longRest");
  });

  it.each([
    [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [9, 4], [11, 4], [12, 5], [16, 5], [17, 6], [19, 6],
  ])("EDITION_2014 level %i → %i rage uses", (level, expectedTotal) => {
    const result = deriveResources("barbarian", undefined, level, ABILITY_SCORES, PROF_2, testFeatureRowsFor("barbarian", undefined), "EDITION_2014");
    const rage = result!.resources.find((r) => r.key === "rage");
    expect(rage!.total).toBe(expectedTotal);
    expect(rage!.recharge).toBe("longRest");
  });

  it("EDITION_2024 level 20: caps at 6 (SRD 5.2 p.20 — no L20 tier, level 17's tier still applies)", () => {
    const result = deriveResources("barbarian", undefined, 20, ABILITY_SCORES, PROF_4, testFeatureRowsFor("barbarian", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "rage")!.total).toBe(6);
  });

  it("EDITION_2014 level 20: unlimited sentinel (SRD 5.1 p.21 — unaffected by the 2024 fix)", () => {
    const result = deriveResources("barbarian", undefined, 20, ABILITY_SCORES, PROF_4, testFeatureRowsFor("barbarian", undefined), "EDITION_2014");
    // 99, not just "> 10": the sibling EDITION_2024 case above pins its value
    // exactly, and a loose bound on the one number this whole issue turns on
    // would still pass if the 2014 tier were silently rewritten to any other
    // large total.
    expect(result!.resources.find((r) => r.key === "rage")!.total).toBe(99);
  });
});

// ── Bard — Bardic Inspiration ─────────────────────────────────────────────────

const PROF_4 = 4;

describe("deriveResources — Bard Bardic Inspiration", () => {
  const HIGH_CHA = { ...ABILITY_SCORES, charisma: 16 }; // +3 modifier

  it("die is d6 before level 5", () => {
    const result = deriveResources("bard", undefined, 3, HIGH_CHA, PROF_2, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    const bi = result!.resources.find((r) => r.key === "bardicInspiration");
    expect(bi!.die).toBe("d6");
  });

  it("die is d8 at level 5", () => {
    const result = deriveResources("bard", undefined, 5, HIGH_CHA, PROF_3, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d8");
  });

  it("die is d10 at level 10", () => {
    const result = deriveResources("bard", undefined, 10, HIGH_CHA, PROF_4, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d10");
  });

  it("die is d12 at level 15", () => {
    const result = deriveResources("bard", undefined, 15, HIGH_CHA, PROF_5, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d12");
  });

  it("recharges on longRest before level 5", () => {
    const result = deriveResources("bard", undefined, 4, HIGH_CHA, PROF_2, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.recharge).toBe("longRest");
  });

  it("recharges on short-or-long at level 5 (Font of Inspiration)", () => {
    const result = deriveResources("bard", undefined, 5, HIGH_CHA, PROF_3, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.recharge).toBe("short-or-long");
  });

  it("total = max(1, Cha modifier)", () => {
    const result = deriveResources("bard", undefined, 3, HIGH_CHA, PROF_2, testFeatureRowsFor("bard", undefined), "EDITION_2024"); // Cha +3
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.total).toBe(3);
  });

  it("total minimum 1 with Cha modifier ≤ 0", () => {
    const lowCha = { ...ABILITY_SCORES, charisma: 8 }; // -1 modifier
    const result = deriveResources("bard", undefined, 3, lowCha, PROF_2, testFeatureRowsFor("bard", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.total).toBe(1);
  });

  // #1224: the pool is verified edition-invariant against both SRDs — pins
  // that nobody later adds an `edition` parameter to special-case one of them.
  // Exact arity, not an upper bound: dropping `abilityScores` would break the
  // Cha-modifier total that is the whole reason this module still exists.
  it("resourceFn declares no edition parameter (edition-invariant pool)", () => {
    expect(bard.resourceFn!.length).toBe(2);
  });
});

// ── Fighter — multi-pool ───────────────────────────────────────────────────────

describe("deriveResources — Fighter base pools", () => {
  it("has secondWind at level 1", () => {
    const result = deriveResources("fighter", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "secondWind")).toBeDefined();
  });

  it("has actionSurge starting at level 2 (total 1)", () => {
    const result = deriveResources("fighter", undefined, 2, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "actionSurge")!.total).toBe(1);
  });

  it("actionSurge total is 2 at level 17", () => {
    const result = deriveResources("fighter", undefined, 17, ABILITY_SCORES, PROF_6, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "actionSurge")!.total).toBe(2);
  });

  it("has no indomitable before level 9", () => {
    const result = deriveResources("fighter", undefined, 8, ABILITY_SCORES, PROF_3, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "indomitable")).toBeUndefined();
  });

  it("indomitable appears at level 9 (total 1)", () => {
    const result = deriveResources("fighter", undefined, 9, ABILITY_SCORES, PROF_4, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "indomitable")!.total).toBe(1);
  });

  it("indomitable total is 2 at level 13", () => {
    const result = deriveResources("fighter", undefined, 13, ABILITY_SCORES, PROF_5, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "indomitable")!.total).toBe(2);
  });
});

// ── Monk — Focus (2024 rename of Ki, #1222) ───────────────────────────────────

describe("deriveResources — Monk Focus", () => {
  it("no focus pool below level 2", () => {
    const result = deriveResources("monk", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("monk", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "focus")).toBeUndefined();
  });

  it("focus total equals monk level", () => {
    for (const level of [2, 5, 10, 17, 20]) {
      const result = deriveResources("monk", undefined, level, ABILITY_SCORES, PROF_2, testFeatureRowsFor("monk", undefined), "EDITION_2024");
      expect(result!.resources.find((r) => r.key === "focus")!.total).toBe(level);
    }
  });

  it("focus recharges on short-or-long rest", () => {
    const result = deriveResources("monk", undefined, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("monk", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "focus")!.recharge).toBe("short-or-long");
  });
});

// ── Monk — Warrior of the Elements (2024) ─────────────────────────────────────
// The Elemental Attunement/Elemental Burst level gates moved off DerivedClassInfo
// booleans onto DERIVED_ACTIONS rows (#1315) — see actions.test.ts's "Warrior of
// the Elements" describe block for that gating coverage.

describe("deriveResources — Warrior of the Elements", () => {
  it("surfaces all four fixed features by level 17", () => {
    const result = deriveResources("monk", "warrior of the elements", 17, ABILITY_SCORES, PROF_2, testFeatureRowsFor("monk", "warrior of the elements"), "EDITION_2024");
    const names = result!.features.filter((f) => f.source === "subclass").map((f) => f.name);
    for (const feature of [
      "Manipulate Elements",
      "Elemental Attunement",
      "Elemental Burst",
      "Stride of the Elements",
      "Elemental Epitome",
    ]) {
      expect(names).toContain(feature);
    }
  });

  it("does not surface subclass features below grant level 3", () => {
    const result = deriveResources("monk", "warrior of the elements", 2, ABILITY_SCORES, PROF_2, testFeatureRowsFor("monk", "warrior of the elements"), "EDITION_2024");
    expect(result!.features.some((f) => f.source === "subclass")).toBe(false);
  });
});

// ── Monk — Warrior of Shadow (2024 rewrite, PHB'24 p.91, #1246) ──────────────
// The Shadow Arts/Cloak of Shadows level gates moved off DerivedClassInfo
// booleans onto DERIVED_ACTIONS rows (#1315) — see actions.test.ts's "Warrior
// of Shadow" describe block for that gating coverage.

describe("deriveResources — Warrior of Shadow", () => {
  it("describes the 1-focus Darkness cast plus Minor Illusion + Darkvision at level 3", () => {
    const result = deriveResources("monk", "warrior of shadow", 3, ABILITY_SCORES, PROF_2, testFeatureRowsFor("monk", "warrior of shadow"), "EDITION_2024");
    const feature = result!.features.find((f) => f.name === "Shadow Arts");
    expect(feature?.description).toMatch(/1 focus/i);
    expect(feature?.description).toMatch(/darkness/i);
    expect(feature?.description).toMatch(/minor illusion/i);
    expect(feature?.description).toMatch(/darkvision/i);
  });

  it("surfaces Improved Shadow Step at level 11 (replaces the 2014 Cloak of Shadows slot)", () => {
    const below = deriveResources("monk", "warrior of shadow", 10, ABILITY_SCORES, PROF_4, testFeatureRowsFor("monk", "warrior of shadow"), "EDITION_2024");
    expect(below!.features.some((f) => f.name === "Improved Shadow Step")).toBe(false);
    const result = deriveResources("monk", "warrior of shadow", 11, ABILITY_SCORES, PROF_4, testFeatureRowsFor("monk", "warrior of shadow"), "EDITION_2024");
    expect(result!.features.some((f) => f.name === "Improved Shadow Step")).toBe(true);
    // Cloak of Shadows hasn't unlocked yet at L11 — it moved to L17.
    expect(result!.features.some((f) => f.name === "Cloak of Shadows")).toBe(false);
  });

  it("surfaces the Cloak of Shadows feature at level 17", () => {
    const result = deriveResources("monk", "warrior of shadow", 17, ABILITY_SCORES, PROF_4, testFeatureRowsFor("monk", "warrior of shadow"), "EDITION_2024");
    expect(result!.features.some((f) => f.name === "Cloak of Shadows")).toBe(true);
  });

  it("no Opportunist feature at any level (2014 L17 feature retired)", () => {
    for (const level of [17, 20]) {
      const result = deriveResources("monk", "warrior of shadow", level, ABILITY_SCORES, PROF_4, testFeatureRowsFor("monk", "warrior of shadow"), "EDITION_2024");
      expect(result!.features.some((f) => f.name === "Opportunist")).toBe(false);
    }
  });
});

// ── Paladin — multi-pool ───────────────────────────────────────────────────────

describe("deriveResources — Paladin base pools", () => {
  const CHA_16 = { ...ABILITY_SCORES, charisma: 16 }; // +3 modifier

  it("layOnHands total = 5 × level, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      for (const level of [1, 5, 10, 20]) {
        const result = deriveResources("paladin", undefined, level, CHA_16, PROF_2, testFeatureRowsFor("paladin", undefined), edition);
        expect(result!.resources.find((r) => r.key === "layOnHands")!.total).toBe(level * 5);
      }
    }
  });

  // #1229: 2024 removed Divine Sense as its own resource pool (its job moves
  // to the "Channel Divinity: Divine Sense" catalog option, spending the
  // channelDivinity pool instead) — a 2014 Paladin still has it.
  it("divineSense total = 1 + Cha modifier, EDITION_2014 only", () => {
    const result2014 = deriveResources("paladin", undefined, 5, CHA_16, PROF_3, testFeatureRowsFor("paladin", undefined), "EDITION_2014"); // +3 Cha
    expect(result2014!.resources.find((r) => r.key === "divineSense")!.total).toBe(4); // 1+3
  });

  it("divineSense is absent for EDITION_2024", () => {
    const result2024 = deriveResources("paladin", undefined, 5, CHA_16, PROF_3, testFeatureRowsFor("paladin", undefined), "EDITION_2024");
    expect(result2024!.resources.find((r) => r.key === "divineSense")).toBeUndefined();
  });

  it("no channelDivinity before level 3, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const result = deriveResources("paladin", undefined, 2, CHA_16, PROF_2, testFeatureRowsFor("paladin", undefined), edition);
      expect(result!.resources.find((r) => r.key === "channelDivinity")).toBeUndefined();
    }
  });

  it("channelDivinity appears at level 3: total 1 (EDITION_2014) vs total 2 (EDITION_2024, SRD 5.2)", () => {
    const result2014 = deriveResources("paladin", undefined, 3, CHA_16, PROF_2, testFeatureRowsFor("paladin", undefined), "EDITION_2014");
    expect(result2014!.resources.find((r) => r.key === "channelDivinity")?.total).toBe(1);

    const result2024 = deriveResources("paladin", undefined, 3, CHA_16, PROF_2, testFeatureRowsFor("paladin", undefined), "EDITION_2024");
    expect(result2024!.resources.find((r) => r.key === "channelDivinity")?.total).toBe(2);
    expect(result2024!.resources.find((r) => r.key === "channelDivinity")?.total).not.toBe(1);
  });

  it("channelDivinity's 2024 total rises to 3 at level 11, not before", () => {
    const at10 = deriveResources("paladin", undefined, 10, CHA_16, PROF_3, testFeatureRowsFor("paladin", undefined), "EDITION_2024");
    expect(at10!.resources.find((r) => r.key === "channelDivinity")?.total).toBe(2);

    const at11 = deriveResources("paladin", undefined, 11, CHA_16, PROF_3, testFeatureRowsFor("paladin", undefined), "EDITION_2024");
    expect(at11!.resources.find((r) => r.key === "channelDivinity")?.total).toBe(3);
  });

  it("oaths share base channelDivinity pool — exactly one channelDivinity pool, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      for (const oath of ["oath of devotion", "oath of the ancients", "oath of vengeance"]) {
        const result = deriveResources("paladin", oath, 5, CHA_16, PROF_3, testFeatureRowsFor("paladin", oath), edition);
        const cdPools = result!.resources.filter((r) => r.key === "channelDivinity");
        expect(cdPools.length).toBe(1);
      }
    }
  });
});

// ── Sorcerer — Sorcery Points ─────────────────────────────────────────────────

describe("deriveResources — Sorcerer Sorcery Points", () => {
  it("no sorcery points before level 2", () => {
    const result = deriveResources("sorcerer", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("sorcerer", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "sorceryPoints")).toBeUndefined();
  });

  it("sorcery points total equals sorcerer level", () => {
    for (const level of [2, 5, 10, 20]) {
      const result = deriveResources("sorcerer", undefined, level, ABILITY_SCORES, PROF_2, testFeatureRowsFor("sorcerer", undefined), "EDITION_2024");
      expect(result!.resources.find((r) => r.key === "sorceryPoints")!.total).toBe(level);
    }
  });
});

// ── Cleric — Channel Divinity ─────────────────────────────────────────────────

// #1225: these totals are 2024's own SRD 5.2 progression (2/3/4 at L2/6/18),
// NOT 2014's (1/2/3) — before this issue's retab, a 2024 Cleric's pool still
// came from lib/classes/cleric.ts's edition-blind resourceFn, so a level-2
// 2024 Cleric derived only 1 use instead of the real 2. This suite used to
// pin that bug; it now pins the fix.
describe("deriveResources — Cleric Channel Divinity", () => {
  it("no channelDivinity at level 1", () => {
    const result = deriveResources("cleric", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("cleric", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "channelDivinity")).toBeUndefined();
  });

  it("2 uses at levels 2–5", () => {
    for (const level of [2, 3, 5]) {
      const result = deriveResources("cleric", undefined, level, ABILITY_SCORES, PROF_2, testFeatureRowsFor("cleric", undefined), "EDITION_2024");
      expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(2);
    }
  });

  it("3 uses at level 6", () => {
    const result = deriveResources("cleric", undefined, 6, ABILITY_SCORES, PROF_3, testFeatureRowsFor("cleric", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(3);
  });

  it("4 uses at level 18", () => {
    const result = deriveResources("cleric", undefined, 18, ABILITY_SCORES, PROF_6, testFeatureRowsFor("cleric", undefined), "EDITION_2024");
    expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(4);
  });

  it("domains share base channelDivinity — no duplicates", () => {
    for (const domain of ["life domain", "trickery domain"]) {
      const result = deriveResources("cleric", domain, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("cleric", domain), "EDITION_2024");
      const cdPools = result!.resources.filter((r) => r.key === "channelDivinity");
      expect(cdPools.length).toBe(1);
    }
  });
});

// ── Features-only classes (Ranger, Wizard, Warlock) ─────────────────────────
// Rogue's own case moved out of this synchronous, TS-fixture-driven suite in
// #1231 commit 4: `lib/classes/rogue.ts` is deleted, so `testFeatureRowsFor(
// "rogue", ...)` now yields an EMPTY carrier (Rogue is no longer in
// TEST_CLASSES) and `deriveResources` correctly returns null for it here —
// the same absent-class shape Fighter's and Barbarian's own deletions never
// exercised in this file (neither was ever listed above). Rogue's real
// "features but no resource pools" behaviour is covered DB-backed instead,
// by rogue-unregistered.test.ts's own resource-pool-emptiness check.

describe("deriveResources — features-only classes", () => {
  // #1230: the base class gained a real pool (Favored Enemy, L1) once its
  // 2024 content and resource columns were authored — this class is no
  // longer "features-only" at level 5 EDITION_2024 (or any level >= 1 under
  // 2024). EDITION_2014 stays features-only — Favored Enemy's 2014 row
  // carries no resourceKey at all.
  it("Ranger has features and the Favored Enemy pool from level 1 (#1230)", () => {
    const result = deriveResources("ranger", undefined, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("ranger", undefined), "EDITION_2024");
    expect(result).not.toBeNull();
    expect(result!.resources.map((r) => r.key)).toEqual(["favoredEnemy"]);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Ranger EDITION_2014 stays features-only — no resourceKey on its 2014 rows", () => {
    const result = deriveResources("ranger", undefined, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("ranger", undefined), "EDITION_2014");
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Wizard has features and the Arcane Recovery pool (#904)", () => {
    const result = deriveResources("wizard", undefined, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("wizard", undefined), "EDITION_2024");
    expect(result).not.toBeNull();
    expect(result!.resources.map((r) => r.key)).toEqual(["arcaneRecovery"]);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  // #1233: the base class gained a real pool (Magical Cunning, L2) once its
  // 2024 content and resource columns were authored — this class is no
  // longer "features-only" at level 5 EDITION_2024. Below level 2 it still
  // has none.
  it("Warlock has features and, from level 2 on, the Magical Cunning pool (#1233)", () => {
    const result = deriveResources("warlock", undefined, 5, ABILITY_SCORES, PROF_3, testFeatureRowsFor("warlock", undefined), "EDITION_2024");
    expect(result).not.toBeNull();
    expect(result!.resources.map((r) => r.key)).toEqual(["magicalCunning"]);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Warlock has no resource pools below level 2 EDITION_2024 (Magical Cunning's own grant level)", () => {
    const result = deriveResources("warlock", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("warlock", undefined), "EDITION_2024");
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
  });
});

// ── Feature level gating ──────────────────────────────────────────────────────

describe("deriveResources — feature level gating", () => {
  it("does not surface features above current level", () => {
    const result = deriveResources("fighter", undefined, 1, ABILITY_SCORES, PROF_2, testFeatureRowsFor("fighter", undefined), "EDITION_2024");
    const hasHighLevelFeature = result!.features.some((f) => f.level > 1);
    expect(hasHighLevelFeature).toBe(false);
  });

  it("surfaces features up to and including current level", () => {
    const result = deriveResources("monk", undefined, 7, ABILITY_SCORES, PROF_3, testFeatureRowsFor("monk", undefined), "EDITION_2024");
    const names = result!.features.map((f) => f.name);
    expect(names).toContain("Evasion");       // level 7
    expect(names).toContain("Stunning Strike"); // level 5
    expect(names).not.toContain("Diamond Soul"); // level 14
  });

  it("features are sorted by level ascending", () => {
    const result = deriveResources("barbarian", undefined, 10, ABILITY_SCORES, PROF_4, testFeatureRowsFor("barbarian", undefined), "EDITION_2024");
    const levels = result!.features.map((f) => f.level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});

// ── Proficiency bonus constants used above ────────────────────────────────────
const PROF_5 = 5;
const PROF_6 = 6;

// ── deriveSpellcasting — full casters (regression) ────────────────────────────

describe("deriveSpellcasting — full casters", () => {
  it("derives wizard slots and INT-based DC, with no Mystic Arcanum", () => {
    const info = deriveSpellcasting("wizard", 1, CASTER_SCORES, PROF_2)!;
    expect(info.ability).toBe("intelligence");
    expect(info.spellSaveDC).toBe(8 + PROF_2 + 1); // INT +1
    expect(slotMap(info)).toEqual({ 1: 2 });
    expect(info.arcana).toEqual([]);
  });

  it("returns null for a non-caster class", () => {
    expect(deriveSpellcasting("fighter", 5, CASTER_SCORES, PROF_3)).toBeNull();
  });
});

// ── deriveSpellcasting — half-casters (Paladin / Ranger) ──────────────────────

describe("deriveSpellcasting — half-casters", () => {
  it("casts from level 1 with two 1st-level slots (SRD 5.2)", () => {
    expect(slotMap(deriveSpellcasting("paladin", 1, CASTER_SCORES, PROF_2))).toEqual({ 1: 2 });
    expect(slotMap(deriveSpellcasting("ranger", 1, CASTER_SCORES, PROF_2))).toEqual({ 1: 2 });
  });

  it("grants two 1st-level slots at level 2", () => {
    expect(slotMap(deriveSpellcasting("paladin", 2, CASTER_SCORES, PROF_2))).toEqual({ 1: 2 });
  });

  it("gains 3rd-level slots at level 9", () => {
    expect(slotMap(deriveSpellcasting("paladin", 9, CASTER_SCORES, PROF_3))).toEqual({
      1: 4, 2: 3, 3: 2,
    });
  });

  it("gains a 5th-level slot at level 17", () => {
    expect(slotMap(deriveSpellcasting("ranger", 17, CASTER_SCORES, PROF_6))).toEqual({
      1: 4, 2: 3, 3: 3, 4: 3, 5: 1,
    });
  });

  it("uses CHA for Paladin and WIS for Ranger", () => {
    const pal = deriveSpellcasting("paladin", 5, CASTER_SCORES, PROF_3)!;
    expect(pal.ability).toBe("charisma");
    expect(pal.spellSaveDC).toBe(8 + PROF_3 + 3); // CHA +3
    const rng = deriveSpellcasting("ranger", 5, CASTER_SCORES, PROF_3)!;
    expect(rng.ability).toBe("wisdom");
    expect(rng.spellSaveDC).toBe(8 + PROF_3 + 2); // WIS +2
  });

  it("never grants Mystic Arcanum", () => {
    expect(deriveSpellcasting("paladin", 20, CASTER_SCORES, PROF_6)!.arcana).toEqual([]);
  });
});

// ── deriveSpellcasting — Warlock Pact Magic ───────────────────────────────────

describe("deriveSpellcasting — Warlock Pact Magic", () => {
  it("grants a single 1st-level slot at level 1 (CHA-based)", () => {
    const info = deriveSpellcasting("warlock", 1, CASTER_SCORES, PROF_2)!;
    expect(info.ability).toBe("charisma");
    expect(info.spellSaveDC).toBe(8 + PROF_2 + 3); // CHA +3
    expect(slotMap(info)).toEqual({ 1: 1 });
  });

  it("scales pact slots to a single, ever-rising level", () => {
    expect(slotMap(deriveSpellcasting("warlock", 5, CASTER_SCORES, PROF_3))).toEqual({ 3: 2 });
    expect(slotMap(deriveSpellcasting("warlock", 11, CASTER_SCORES, PROF_4))).toEqual({ 5: 3 });
    expect(slotMap(deriveSpellcasting("warlock", 20, CASTER_SCORES, PROF_6))).toEqual({ 5: 4 });
  });

  it("never produces slots above level 5", () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const levels = Object.keys(slotMap(deriveSpellcasting("warlock", lvl, CASTER_SCORES, PROF_2))).map(Number);
      expect(Math.max(...levels)).toBeLessThanOrEqual(5);
    }
  });
});

// ── deriveSpellcasting — Mystic Arcanum ───────────────────────────────────────

describe("deriveSpellcasting — Mystic Arcanum", () => {
  it("has no arcanum below level 11", () => {
    expect(deriveSpellcasting("warlock", 10, CASTER_SCORES, PROF_4)!.arcana).toEqual([]);
  });

  it("grants a 6th-level arcanum at level 11", () => {
    expect(deriveSpellcasting("warlock", 11, CASTER_SCORES, PROF_4)!.arcana).toEqual([
      { level: 6, total: 1 },
    ]);
  });

  it("grants all four arcana (6th–9th) at level 17", () => {
    expect(deriveSpellcasting("warlock", 17, CASTER_SCORES, PROF_6)!.arcana).toEqual([
      { level: 6, total: 1 },
      { level: 7, total: 1 },
      { level: 8, total: 1 },
      { level: 9, total: 1 },
    ]);
  });
});

// ── deriveSpellcasting — third-caster subclasses (regression) ─────────────────

describe("deriveSpellcasting — third casters", () => {
  it("derives Eldritch Knight slots at level 3 (INT-based, no arcanum)", () => {
    const info = deriveSpellcasting("fighter", 3, CASTER_SCORES, PROF_2, "Eldritch Knight")!;
    expect(info.ability).toBe("intelligence");
    expect(slotMap(info)).toEqual({ 1: 2 });
    expect(info.arcana).toEqual([]);
  });

  it("returns null for an Arcane Trickster below level 3", () => {
    expect(deriveSpellcasting("rogue", 2, CASTER_SCORES, PROF_2, "Arcane Trickster")).toBeNull();
  });
});
