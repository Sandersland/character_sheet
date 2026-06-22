/**
 * Unit tests for lib/turnRules.ts — pure functions, no React.
 * Mirrors actionResolvers.test.ts style: explicit vitest imports, no globals.
 */

import { describe, expect, it } from "vitest";

import {
  deriveAttacksPerAction,
  canTwoWeaponFight,
  universalActionsForCost,
  UNIVERSAL_ACTIONS,
} from "@/lib/turnRules";

// ── deriveAttacksPerAction ────────────────────────────────────────────────────

describe("deriveAttacksPerAction — fighter thresholds", () => {
  it("L1–4 → 1 attack", () => {
    expect(deriveAttacksPerAction("fighter", undefined, 1)).toBe(1);
    expect(deriveAttacksPerAction("fighter", undefined, 4)).toBe(1);
  });

  it("L5–10 → 2 attacks (Extra Attack)", () => {
    expect(deriveAttacksPerAction("fighter", undefined, 5)).toBe(2);
    expect(deriveAttacksPerAction("fighter", undefined, 10)).toBe(2);
  });

  it("L11–19 → 3 attacks", () => {
    expect(deriveAttacksPerAction("fighter", undefined, 11)).toBe(3);
    expect(deriveAttacksPerAction("fighter", undefined, 19)).toBe(3);
  });

  it("L20 → 4 attacks", () => {
    expect(deriveAttacksPerAction("fighter", undefined, 20)).toBe(4);
  });

  it("is case-insensitive", () => {
    expect(deriveAttacksPerAction("FIGHTER", undefined, 5)).toBe(2);
    expect(deriveAttacksPerAction("Fighter", undefined, 11)).toBe(3);
  });
});

describe("deriveAttacksPerAction — barbarian / monk / paladin / ranger", () => {
  const classes = ["barbarian", "monk", "paladin", "ranger"] as const;

  for (const cls of classes) {
    it(`${cls}: L4 → 1, L5 → 2`, () => {
      expect(deriveAttacksPerAction(cls, undefined, 4)).toBe(1);
      expect(deriveAttacksPerAction(cls, undefined, 5)).toBe(2);
    });
  }
});

describe("deriveAttacksPerAction — bard", () => {
  it("non-valor bard never gets Extra Attack", () => {
    expect(deriveAttacksPerAction("bard", undefined, 10)).toBe(1);
    expect(deriveAttacksPerAction("bard", "College of Lore", 10)).toBe(1);
  });

  it("College of Valor bard L5 → still 1 (granted at L6)", () => {
    expect(deriveAttacksPerAction("bard", "College of Valor", 5)).toBe(1);
  });

  it("College of Valor bard L6 → 2 attacks", () => {
    expect(deriveAttacksPerAction("bard", "College of Valor", 6)).toBe(2);
    expect(deriveAttacksPerAction("bard", "college of valor", 6)).toBe(2);
  });
});

describe("deriveAttacksPerAction — no Extra Attack classes", () => {
  const classes = ["wizard", "cleric", "rogue", "sorcerer", "warlock", "druid"] as const;

  for (const cls of classes) {
    it(`${cls} → always 1`, () => {
      expect(deriveAttacksPerAction(cls, undefined, 20)).toBe(1);
    });
  }
});

// ── canTwoWeaponFight ─────────────────────────────────────────────────────────

/** Minimal item shape canTwoWeaponFight actually reads. */
function makeWeapon(light: boolean, equipped = true) {
  return { equipped, category: "weapon" as const, weapon: { light } };
}

describe("canTwoWeaponFight", () => {
  it("two equipped light weapons → true", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)])).toBe(true);
  });

  it("fewer than 2 equipped weapons → false", () => {
    expect(canTwoWeaponFight([])).toBe(false);
    expect(canTwoWeaponFight([makeWeapon(true)])).toBe(false);
  });

  it("two equipped weapons but the second is not light → false", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(false)])).toBe(false);
  });

  it("two equipped weapons but the first is not light → false", () => {
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(true)])).toBe(false);
  });

  it("unequipped weapons are ignored", () => {
    // Two light weapons, but neither equipped → false.
    expect(canTwoWeaponFight([makeWeapon(true, false), makeWeapon(true, false)])).toBe(false);
  });

  it("non-weapon categories are ignored", () => {
    const armor = { equipped: true, category: "armor" as const, weapon: null };
    expect(canTwoWeaponFight([armor, makeWeapon(true)])).toBe(false);
  });

  it("weapon with null weapon detail is excluded", () => {
    const noDetail = { equipped: true, category: "weapon" as const, weapon: null };
    expect(canTwoWeaponFight([noDetail, noDetail])).toBe(false);
  });
});

// ── UNIVERSAL_ACTIONS + universalActionsForCost ───────────────────────────────

describe("UNIVERSAL_ACTIONS", () => {
  it("has exactly 14 entries (lock the list)", () => {
    expect(UNIVERSAL_ACTIONS).toHaveLength(14);
  });

  it("cost distribution: 11 action, 1 bonusAction, 2 reaction, 0 free/special", () => {
    const byCost = UNIVERSAL_ACTIONS.reduce<Record<string, number>>((acc, a) => {
      acc[a.cost] = (acc[a.cost] ?? 0) + 1;
      return acc;
    }, {});

    expect(byCost["action"]).toBe(11);
    expect(byCost["bonusAction"]).toBe(1);
    expect(byCost["reaction"]).toBe(2);
    expect(byCost["free"]).toBeUndefined();
    expect(byCost["special"]).toBeUndefined();
  });

  it("every entry has a non-empty key, label, cost, and description", () => {
    for (const a of UNIVERSAL_ACTIONS) {
      expect(a.key.length, `key empty on entry "${a.label}"`).toBeGreaterThan(0);
      expect(a.label.length, `label empty on key "${a.key}"`).toBeGreaterThan(0);
      expect(a.cost.length, `cost empty on key "${a.key}"`).toBeGreaterThan(0);
      expect(a.description.length, `description empty on key "${a.key}"`).toBeGreaterThan(0);
    }
  });
});

describe("universalActionsForCost", () => {
  it("returns only entries for the requested cost", () => {
    const actions = universalActionsForCost("action");
    expect(actions.length).toBe(11);
    expect(actions.every((a) => a.cost === "action")).toBe(true);
  });

  it("returns bonusAction entries", () => {
    const actions = universalActionsForCost("bonusAction");
    expect(actions.length).toBe(1);
    expect(actions[0].key).toBe("castSpellBonus");
  });

  it("returns reaction entries", () => {
    const actions = universalActionsForCost("reaction");
    expect(actions.length).toBe(2);
    expect(actions.map((a) => a.key).sort()).toEqual(
      ["opportunityAttack", "castSpellReaction"].sort(),
    );
  });

  it("returns [] for a cost with no matching entries", () => {
    expect(universalActionsForCost("free")).toEqual([]);
    expect(universalActionsForCost("special")).toEqual([]);
  });
});
