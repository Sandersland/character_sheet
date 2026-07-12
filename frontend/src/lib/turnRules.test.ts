/**
 * Unit tests for lib/turnRules.ts — pure functions, no React.
 * Mirrors actionResolvers.test.ts style: explicit vitest imports, no globals.
 */

import { describe, expect, it } from "vitest";

import {
  canTwoWeaponFight,
  universalActionsForCost,
  UNIVERSAL_ACTIONS,
} from "@/lib/turnRules";

// deriveAttacksPerAction moved to the backend (srd.ts); Extra Attack counts now
// arrive on the serialized character as `attacksPerAction`.

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

  // ── Two-Weapon Fighting style relaxes the light restriction (#732) ──────────
  it("non-light pair → false without the Two-Weapon Fighting style", () => {
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(false)])).toBe(false);
    // An unrelated style does not relax it either.
    expect(canTwoWeaponFight([makeWeapon(false), makeWeapon(false)], "dueling")).toBe(false);
  });

  it("non-light pair → true WITH the Two-Weapon Fighting style", () => {
    expect(
      canTwoWeaponFight([makeWeapon(false), makeWeapon(false)], "twoWeaponFighting"),
    ).toBe(true);
    // A mixed pair also qualifies with the style.
    expect(
      canTwoWeaponFight([makeWeapon(true), makeWeapon(false)], "twoWeaponFighting"),
    ).toBe(true);
  });

  it("the style still requires ≥2 equipped weapons", () => {
    expect(canTwoWeaponFight([makeWeapon(false)], "twoWeaponFighting")).toBe(false);
    expect(canTwoWeaponFight([], "twoWeaponFighting")).toBe(false);
  });

  it("two light weapons stay valid regardless of style (null / present)", () => {
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)], null)).toBe(true);
    expect(canTwoWeaponFight([makeWeapon(true), makeWeapon(true)], "twoWeaponFighting")).toBe(true);
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
