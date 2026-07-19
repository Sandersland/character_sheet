import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
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

  it("Circle of the Moon contributes features (Combat Wild Shape, Circle Forms) at its level-3 grant (#1128)", () => {
    const result = deriveResources("druid", "circle of the moon", 3, ABILITY_SCORES, PROF_2);
    const featureNames = result!.features.map((f) => f.name);
    expect(featureNames).toContain("Combat Wild Shape");
    expect(featureNames).toContain("Circle Forms");
  });
});

// ── Barbarian — Rage ──────────────────────────────────────────────────────────

describe("deriveResources — Barbarian Rage", () => {
  const PROF_4 = 4;

  it.each([
    [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [9, 4], [11, 4], [12, 5], [16, 5], [17, 6], [19, 6],
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

// ── Monk — Way of the Four Elements ───────────────────────────────────────────

describe("deriveResources — Way of the Four Elements", () => {
  it("does not set disciplineChoiceCount below grant level 3", () => {
    const result = deriveResources("monk", "way of the four elements", 2, ABILITY_SCORES, PROF_2);
    expect(result!.disciplineChoiceCount).toBeUndefined();
  });

  it("disciplineChoiceCount is 1/2/3/4 at levels 3/6/11/17", () => {
    const expected: [number, number][] = [[3, 1], [6, 2], [11, 3], [17, 4]];
    for (const [level, count] of expected) {
      const result = deriveResources("monk", "way of the four elements", level, ABILITY_SCORES, PROF_2);
      expect(result!.disciplineChoiceCount).toBe(count);
    }
  });

  it("surfaces Disciple of the Elements at level 3", () => {
    const result = deriveResources("monk", "way of the four elements", 3, ABILITY_SCORES, PROF_2);
    expect(result!.features.some((f) => f.name === "Disciple of the Elements")).toBe(true);
  });

  it("does not surface subclass features below grant level 3", () => {
    const result = deriveResources("monk", "way of the four elements", 2, ABILITY_SCORES, PROF_2);
    expect(result!.features.some((f) => f.source === "subclass")).toBe(false);
  });

  it("leaves other monks unaffected (no disciplineChoiceCount)", () => {
    const openHand = deriveResources("monk", "way of the open hand", 6, ABILITY_SCORES, PROF_3);
    expect(openHand!.disciplineChoiceCount).toBeUndefined();
    const noSub = deriveResources("monk", undefined, 6, ABILITY_SCORES, PROF_3);
    expect(noSub!.disciplineChoiceCount).toBeUndefined();
  });
});

// ── Monk — Way of Shadow ──────────────────────────────────────────────────────

describe("deriveResources — Way of Shadow", () => {
  it("does not set shadowArtsAvailable below grant level 3", () => {
    const result = deriveResources("monk", "way of shadow", 2, ABILITY_SCORES, PROF_2);
    expect(result!.shadowArtsAvailable).toBeUndefined();
  });

  it("sets shadowArtsAvailable at level 3", () => {
    const result = deriveResources("monk", "way of shadow", 3, ABILITY_SCORES, PROF_2);
    expect(result!.shadowArtsAvailable).toBe(true);
  });

  it("does not set cloakOfShadowsAvailable below level 11", () => {
    for (const level of [3, 6, 10]) {
      const result = deriveResources("monk", "way of shadow", level, ABILITY_SCORES, PROF_4);
      expect(result!.cloakOfShadowsAvailable).toBeUndefined();
    }
  });

  it("sets cloakOfShadowsAvailable at level 11 and above", () => {
    for (const level of [11, 17, 20]) {
      const result = deriveResources("monk", "way of shadow", level, ABILITY_SCORES, PROF_4);
      expect(result!.cloakOfShadowsAvailable).toBe(true);
    }
  });

  it("surfaces the Cloak of Shadows feature at level 11", () => {
    const result = deriveResources("monk", "way of shadow", 11, ABILITY_SCORES, PROF_4);
    expect(result!.features.some((f) => f.name === "Cloak of Shadows")).toBe(true);
  });

  it("leaves other monks unaffected (no cloakOfShadowsAvailable)", () => {
    const openHand = deriveResources("monk", "way of the open hand", 11, ABILITY_SCORES, PROF_4);
    expect(openHand!.cloakOfShadowsAvailable).toBeUndefined();
    const noSub = deriveResources("monk", undefined, 11, ABILITY_SCORES, PROF_4);
    expect(noSub!.cloakOfShadowsAvailable).toBeUndefined();
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

  it("Wizard has features and the Arcane Recovery pool (#904)", () => {
    const result = deriveResources("wizard", undefined, 5, ABILITY_SCORES, PROF_3);
    expect(result).not.toBeNull();
    expect(result!.resources.map((r) => r.key)).toEqual(["arcaneRecovery"]);
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
  it("returns null at level 1 (no spellcasting until level 2)", () => {
    expect(deriveSpellcasting("paladin", 1, CASTER_SCORES, PROF_2)).toBeNull();
    expect(deriveSpellcasting("ranger", 1, CASTER_SCORES, PROF_2)).toBeNull();
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
