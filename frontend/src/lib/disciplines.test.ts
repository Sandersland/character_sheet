import { describe, it, expect } from "vitest";

import {
  maxFocusPerDiscipline,
  disciplineBaseCost,
  isDisciplineScalable,
  focusRemaining,
  disciplineFocusOptions,
  disciplineRollSpec,
} from "@/lib/disciplines";
import type { CatalogDiscipline, CharacterResources } from "@/types/character";

// Fangs of the Fire Snake — 1 focus base, +1d10 fire per extra focus, cap-scaled.
const fangs: CatalogDiscipline = {
  id: "fangs",
  name: "Fangs of the Fire Snake",
  description: "…",
  minLevel: 3,
  alwaysKnown: false,
  saveAbility: null,
  cost: { kind: "pool", key: "focus", base: 1, perStep: 1 },
  effect: {
    effectType: "damage",
    dice: { count: 1, faces: 10, modifier: 0 },
    damageType: "fire",
    attackType: "attack",
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "focus", dicePerStep: 1 },
  },
};

// Elemental Attunement — always known, no focus, no dice.
const attunement: CatalogDiscipline = {
  id: "attune",
  name: "Elemental Attunement",
  description: "…",
  minLevel: 3,
  alwaysKnown: true,
  saveAbility: null,
  cost: { kind: "none" },
  effect: {
    effectType: "utility",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "focus", dicePerStep: 0 },
  },
};

describe("maxFocusPerDiscipline", () => {
  it("caps at 2 through L4, then +1 every 4 levels up to 6", () => {
    expect(maxFocusPerDiscipline(3)).toBe(2);
    expect(maxFocusPerDiscipline(5)).toBe(3);
    expect(maxFocusPerDiscipline(9)).toBe(4);
    expect(maxFocusPerDiscipline(20)).toBe(6);
  });
});

describe("disciplineBaseCost / isDisciplineScalable", () => {
  it("reads the pool base cost and detects scaling", () => {
    expect(disciplineBaseCost(fangs)).toBe(1);
    expect(disciplineBaseCost(attunement)).toBe(0);
    expect(isDisciplineScalable(fangs)).toBe(true);
    expect(isDisciplineScalable(attunement)).toBe(false);
  });
});

describe("focusRemaining", () => {
  it("reads the focus pool remaining, defaulting to 0", () => {
    const resources = {
      pools: [{ key: "focus", label: "Focus", total: 6, recharge: "shortRest", used: 2, remaining: 4 }],
    } as unknown as CharacterResources;
    expect(focusRemaining(resources)).toBe(4);
    expect(focusRemaining(undefined)).toBe(0);
  });
});

describe("disciplineFocusOptions", () => {
  it("offers base..cap for a scalable discipline, clamped by focus on hand", () => {
    // L9 monk → cap 4; 5 focus available → base 1..4.
    expect(disciplineFocusOptions(fangs, 9, 5)).toEqual([1, 2, 3, 4]);
    // Only 2 focus available → 1..2.
    expect(disciplineFocusOptions(fangs, 9, 2)).toEqual([1, 2]);
  });

  it("returns empty when the base cost can't be afforded", () => {
    expect(disciplineFocusOptions(fangs, 9, 0)).toEqual([]);
  });

  it("returns empty for a no-cost discipline (no focus selector)", () => {
    expect(disciplineFocusOptions(attunement, 9, 5)).toEqual([]);
  });
});

describe("disciplineRollSpec", () => {
  it("adds one d10 per focus above base", () => {
    expect(disciplineRollSpec(fangs, 1, 5)).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(disciplineRollSpec(fangs, 3, 5)).toEqual({ count: 3, faces: 10, modifier: 0 });
  });

  it("is null for a utility discipline with no dice", () => {
    expect(disciplineRollSpec(attunement, 0, 5)).toBeNull();
  });
});
