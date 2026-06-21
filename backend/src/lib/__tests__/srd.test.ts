import { describe, expect, it } from "vitest";

import { deriveResources } from "../class-features.js";

const ABILITY_SCORES = {
  strength: 16, dexterity: 10, constitution: 14,
  intelligence: 10, wisdom: 10, charisma: 10,
};
const PROF_2 = 2;
const PROF_3 = 3; // proficiency at level 5+

// ── Unknown / empty classes ────────────────────────────────────────────────────

describe("deriveResources — unknown class", () => {
  it("returns null for a completely unknown class with no subclass", () => {
    expect(deriveResources("artificer", undefined, 5, ABILITY_SCORES, PROF_2)).toBeNull();
  });

  it("returns null for an unknown class even with an unrecognised subclass", () => {
    expect(deriveResources("artificer", "alchemist", 5, ABILITY_SCORES, PROF_2)).toBeNull();
  });
});

// ── Battle Master subclass layer gating ───────────────────────────────────────
// After the base-class merge, Fighter always has features (Second Wind, etc.)
// even below grant level 3. These tests verify the *subclass* layer specifically.

describe("deriveResources — Battle Master subclass gating", () => {
  it("does not include superiorityDice below grant level 3", () => {
    const result = deriveResources("fighter", "battle master", 2, ABILITY_SCORES, PROF_2);
    // Fighter L2 has base features + pools (Second Wind, Action Surge)
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("superiorityDice");
  });

  it("includes superiorityDice at grant level 3", () => {
    const result = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, PROF_2);
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).toContain("superiorityDice");
  });

  it("still returns non-null for a Fighter below subclass grant level (base features present)", () => {
    const result = deriveResources("fighter", "battle master", 1, ABILITY_SCORES, PROF_2);
    expect(result).not.toBeNull();
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("returns null for a fully unknown subclass on a known class only if class has no data", () => {
    // Fighter has base data, so a purple dragon knight returns non-null (base Fighter features)
    const result = deriveResources("fighter", "purple dragon knight", 5, ABILITY_SCORES, PROF_2);
    expect(result).not.toBeNull();
    // But the unrecognised subclass itself contributes nothing
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("superiorityDice");
  });

  it("sets maneuverChoiceCount and maneuverSaveDC at level 3", () => {
    const result = deriveResources("fighter", "battle master", 3, ABILITY_SCORES, PROF_2);
    expect(result!.maneuverChoiceCount).toBe(3);
    // STR mod +3, DEX mod 0, prof 2 → DC = 8 + 2 + 3 = 13
    expect(result!.maneuverSaveDC).toBe(13);
    expect(result!.toolProfChoiceCount).toBe(1);
  });
});

// ── Druid — Wild Shape base pool ──────────────────────────────────────────────

describe("deriveResources — Druid Wild Shape", () => {
  it("returns no wildShape pool below level 2", () => {
    const result = deriveResources("druid", undefined, 1, ABILITY_SCORES, PROF_2);
    expect(result).not.toBeNull();
    const poolKeys = result!.resources.map((r) => r.key);
    expect(poolKeys).not.toContain("wildShape");
  });

  it("returns 2 wildShape uses at level 2", () => {
    const result = deriveResources("druid", undefined, 2, ABILITY_SCORES, PROF_2);
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws).toBeDefined();
    expect(ws!.total).toBe(2);
    expect(ws!.recharge).toBe("short-or-long");
  });

  it("returns 2 wildShape uses through level 19", () => {
    const result = deriveResources("druid", undefined, 10, ABILITY_SCORES, PROF_4);
    expect(result!.resources.find((r) => r.key === "wildShape")!.total).toBe(2);
  });

  it("returns sentinel value at level 20 (Archdruid)", () => {
    const result = deriveResources("druid", undefined, 20, ABILITY_SCORES, PROF_4);
    const ws = result!.resources.find((r) => r.key === "wildShape");
    expect(ws!.total).toBeGreaterThan(10); // unlimited sentinel
  });

  it("Circle of the Moon shares the base wildShape pool (no duplicate)", () => {
    const result = deriveResources("druid", "circle of the moon", 6, ABILITY_SCORES, PROF_3);
    const wsPools = result!.resources.filter((r) => r.key === "wildShape");
    expect(wsPools.length).toBe(1); // exactly one — no duplicate from subclass
  });

  it("Circle of the Moon contributes features (Combat Wild Shape, Circle Forms)", () => {
    const result = deriveResources("druid", "circle of the moon", 2, ABILITY_SCORES, PROF_2);
    const featureNames = result!.features.map((f) => f.name);
    expect(featureNames).toContain("Combat Wild Shape");
    expect(featureNames).toContain("Circle Forms");
  });
});

// ── Barbarian — Rage ──────────────────────────────────────────────────────────

describe("deriveResources — Barbarian Rage", () => {
  const PROF_4 = 4;

  it.each([
    [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [11, 4], [12, 5], [16, 5], [17, 6], [19, 6],
  ])("level %i → %i rage uses", (level, expectedTotal) => {
    const result = deriveResources("barbarian", undefined, level, ABILITY_SCORES, PROF_2);
    const rage = result!.resources.find((r) => r.key === "rage");
    expect(rage!.total).toBe(expectedTotal);
    expect(rage!.recharge).toBe("longRest");
  });

  it("level 20 → unlimited sentinel", () => {
    const result = deriveResources("barbarian", undefined, 20, ABILITY_SCORES, PROF_4);
    expect(result!.resources.find((r) => r.key === "rage")!.total).toBeGreaterThan(10);
  });
});

// ── Bard — Bardic Inspiration ─────────────────────────────────────────────────

const PROF_4 = 4;

describe("deriveResources — Bard Bardic Inspiration", () => {
  const HIGH_CHA = { ...ABILITY_SCORES, charisma: 16 }; // +3 modifier

  it("die is d6 before level 5", () => {
    const result = deriveResources("bard", undefined, 3, HIGH_CHA, PROF_2);
    const bi = result!.resources.find((r) => r.key === "bardicInspiration");
    expect(bi!.die).toBe("d6");
  });

  it("die is d8 at level 5", () => {
    const result = deriveResources("bard", undefined, 5, HIGH_CHA, PROF_3);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d8");
  });

  it("die is d10 at level 10", () => {
    const result = deriveResources("bard", undefined, 10, HIGH_CHA, PROF_4);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d10");
  });

  it("die is d12 at level 15", () => {
    const result = deriveResources("bard", undefined, 15, HIGH_CHA, PROF_5);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.die).toBe("d12");
  });

  it("recharges on longRest before level 5", () => {
    const result = deriveResources("bard", undefined, 4, HIGH_CHA, PROF_2);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.recharge).toBe("longRest");
  });

  it("recharges on short-or-long at level 5 (Font of Inspiration)", () => {
    const result = deriveResources("bard", undefined, 5, HIGH_CHA, PROF_3);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.recharge).toBe("short-or-long");
  });

  it("total = max(1, Cha modifier)", () => {
    const result = deriveResources("bard", undefined, 3, HIGH_CHA, PROF_2); // Cha +3
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.total).toBe(3);
  });

  it("total minimum 1 with Cha modifier ≤ 0", () => {
    const lowCha = { ...ABILITY_SCORES, charisma: 8 }; // -1 modifier
    const result = deriveResources("bard", undefined, 3, lowCha, PROF_2);
    expect(result!.resources.find((r) => r.key === "bardicInspiration")!.total).toBe(1);
  });
});

// ── Fighter — multi-pool ───────────────────────────────────────────────────────

describe("deriveResources — Fighter base pools", () => {
  it("has secondWind at level 1", () => {
    const result = deriveResources("fighter", undefined, 1, ABILITY_SCORES, PROF_2);
    expect(result!.resources.find((r) => r.key === "secondWind")).toBeDefined();
  });

  it("has actionSurge starting at level 2 (total 1)", () => {
    const result = deriveResources("fighter", undefined, 2, ABILITY_SCORES, PROF_2);
    expect(result!.resources.find((r) => r.key === "actionSurge")!.total).toBe(1);
  });

  it("actionSurge total is 2 at level 17", () => {
    const result = deriveResources("fighter", undefined, 17, ABILITY_SCORES, PROF_6);
    expect(result!.resources.find((r) => r.key === "actionSurge")!.total).toBe(2);
  });

  it("has no indomitable before level 9", () => {
    const result = deriveResources("fighter", undefined, 8, ABILITY_SCORES, PROF_3);
    expect(result!.resources.find((r) => r.key === "indomitable")).toBeUndefined();
  });

  it("indomitable appears at level 9 (total 1)", () => {
    const result = deriveResources("fighter", undefined, 9, ABILITY_SCORES, PROF_4);
    expect(result!.resources.find((r) => r.key === "indomitable")!.total).toBe(1);
  });

  it("indomitable total is 2 at level 13", () => {
    const result = deriveResources("fighter", undefined, 13, ABILITY_SCORES, PROF_5);
    expect(result!.resources.find((r) => r.key === "indomitable")!.total).toBe(2);
  });
});

// ── Monk — Ki ─────────────────────────────────────────────────────────────────

describe("deriveResources — Monk Ki", () => {
  it("no ki pool below level 2", () => {
    const result = deriveResources("monk", undefined, 1, ABILITY_SCORES, PROF_2);
    expect(result!.resources.find((r) => r.key === "ki")).toBeUndefined();
  });

  it("ki total equals monk level", () => {
    for (const level of [2, 5, 10, 17, 20]) {
      const result = deriveResources("monk", undefined, level, ABILITY_SCORES, PROF_2);
      expect(result!.resources.find((r) => r.key === "ki")!.total).toBe(level);
    }
  });

  it("ki recharges on short-or-long rest", () => {
    const result = deriveResources("monk", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result!.resources.find((r) => r.key === "ki")!.recharge).toBe("short-or-long");
  });
});

// ── Paladin — multi-pool ───────────────────────────────────────────────────────

describe("deriveResources — Paladin base pools", () => {
  const CHA_16 = { ...ABILITY_SCORES, charisma: 16 }; // +3 modifier

  it("layOnHands total = 5 × level", () => {
    for (const level of [1, 5, 10, 20]) {
      const result = deriveResources("paladin", undefined, level, CHA_16, PROF_2);
      expect(result!.resources.find((r) => r.key === "layOnHands")!.total).toBe(level * 5);
    }
  });

  it("divineSense total = 1 + Cha modifier", () => {
    const result = deriveResources("paladin", undefined, 5, CHA_16, PROF_3); // +3 Cha
    expect(result!.resources.find((r) => r.key === "divineSense")!.total).toBe(4); // 1+3
  });

  it("no channelDivinity before level 3", () => {
    const result = deriveResources("paladin", undefined, 2, CHA_16, PROF_2);
    expect(result!.resources.find((r) => r.key === "channelDivinity")).toBeUndefined();
  });

  it("channelDivinity appears at level 3", () => {
    const result = deriveResources("paladin", undefined, 3, CHA_16, PROF_2);
    expect(result!.resources.find((r) => r.key === "channelDivinity")).toBeDefined();
  });

  it("oaths share base channelDivinity pool — exactly one channelDivinity pool", () => {
    for (const oath of ["oath of devotion", "oath of the ancients", "oath of vengeance"]) {
      const result = deriveResources("paladin", oath, 5, CHA_16, PROF_3);
      const cdPools = result!.resources.filter((r) => r.key === "channelDivinity");
      expect(cdPools.length).toBe(1);
    }
  });
});

// ── Sorcerer — Sorcery Points ─────────────────────────────────────────────────

describe("deriveResources — Sorcerer Sorcery Points", () => {
  it("no sorcery points before level 2", () => {
    const result = deriveResources("sorcerer", undefined, 1, ABILITY_SCORES, PROF_2);
    expect(result!.resources.find((r) => r.key === "sorceryPoints")).toBeUndefined();
  });

  it("sorcery points total equals sorcerer level", () => {
    for (const level of [2, 5, 10, 20]) {
      const result = deriveResources("sorcerer", undefined, level, ABILITY_SCORES, PROF_2);
      expect(result!.resources.find((r) => r.key === "sorceryPoints")!.total).toBe(level);
    }
  });
});

// ── Cleric — Channel Divinity ─────────────────────────────────────────────────

describe("deriveResources — Cleric Channel Divinity", () => {
  it("no channelDivinity at level 1", () => {
    const result = deriveResources("cleric", undefined, 1, ABILITY_SCORES, PROF_2);
    expect(result!.resources.find((r) => r.key === "channelDivinity")).toBeUndefined();
  });

  it("1 use at levels 2–5", () => {
    for (const level of [2, 3, 5]) {
      const result = deriveResources("cleric", undefined, level, ABILITY_SCORES, PROF_2);
      expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(1);
    }
  });

  it("2 uses at level 6", () => {
    const result = deriveResources("cleric", undefined, 6, ABILITY_SCORES, PROF_3);
    expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(2);
  });

  it("3 uses at level 18", () => {
    const result = deriveResources("cleric", undefined, 18, ABILITY_SCORES, PROF_6);
    expect(result!.resources.find((r) => r.key === "channelDivinity")!.total).toBe(3);
  });

  it("domains share base channelDivinity — no duplicates", () => {
    for (const domain of ["life domain", "trickery domain"]) {
      const result = deriveResources("cleric", domain, 5, ABILITY_SCORES, PROF_3);
      const cdPools = result!.resources.filter((r) => r.key === "channelDivinity");
      expect(cdPools.length).toBe(1);
    }
  });
});

// ── Features-only classes (Rogue, Ranger, Wizard, Warlock) ──────────────────

describe("deriveResources — features-only classes", () => {
  it("Rogue has features but no resource pools", () => {
    const result = deriveResources("rogue", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Ranger has features but no resource pools", () => {
    const result = deriveResources("ranger", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Wizard has features but no resource pools", () => {
    const result = deriveResources("wizard", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
    expect(result!.features.length).toBeGreaterThan(0);
  });

  it("Warlock has features but no resource pools", () => {
    const result = deriveResources("warlock", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result).not.toBeNull();
    expect(result!.resources).toHaveLength(0);
    expect(result!.features.length).toBeGreaterThan(0);
  });
});

// ── Feature level gating ──────────────────────────────────────────────────────

describe("deriveResources — feature level gating", () => {
  it("does not surface features above current level", () => {
    const result = deriveResources("fighter", undefined, 1, ABILITY_SCORES, PROF_2);
    const hasHighLevelFeature = result!.features.some((f) => f.level > 1);
    expect(hasHighLevelFeature).toBe(false);
  });

  it("surfaces features up to and including current level", () => {
    const result = deriveResources("monk", undefined, 7, ABILITY_SCORES, PROF_3);
    const names = result!.features.map((f) => f.name);
    expect(names).toContain("Evasion");       // level 7
    expect(names).toContain("Stunning Strike"); // level 5
    expect(names).not.toContain("Diamond Soul"); // level 14
  });

  it("features are sorted by level ascending", () => {
    const result = deriveResources("barbarian", undefined, 10, ABILITY_SCORES, PROF_4);
    const levels = result!.features.map((f) => f.level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});

// ── Proficiency bonus constants used above ────────────────────────────────────
const PROF_5 = 5;
const PROF_6 = 6;
