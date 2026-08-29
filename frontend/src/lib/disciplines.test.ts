import { describe, expect, it } from "vitest";

import { affordableSteps, disciplineCastView, effectiveStep } from "@/lib/disciplines";
import type { CatalogDiscipline } from "@/types/character";

// Ceiling 6 is the PHB'14 table's asymptote.
const FANGS: CatalogDiscipline = {
  id: "fangs",
  name: "Fangs of the Fire Snake",
  description: "d",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 1, perStep: 1 },
  effect: { effectType: "damage", dice: { count: 1, faces: 10, modifier: 0 }, scaling: { mode: "poolStep", dicePerStep: 1 } } as CatalogDiscipline["effect"],
  steps: [
    { ki: 1, roll: { count: 1, faces: 10, modifier: 0 } },
    { ki: 2, roll: { count: 2, faces: 10, modifier: 0 } },
    { ki: 3, roll: { count: 3, faces: 10, modifier: 0 } },
    { ki: 4, roll: { count: 4, faces: 10, modifier: 0 } },
    { ki: 5, roll: { count: 5, faces: 10, modifier: 0 } },
    { ki: 6, roll: { count: 6, faces: 10, modifier: 0 } },
  ],
};

const FIST: CatalogDiscipline = {
  id: "fist",
  name: "Fist of Four Thunders",
  description: "d",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 2 },
  effect: { effectType: "damage", dice: { count: 2, faces: 8, modifier: 0 }, scaling: { mode: "poolStep", dicePerStep: 0 } } as CatalogDiscipline["effect"],
  steps: [{ ki: 2, roll: { count: 2, faces: 8, modifier: 0 } }],
};

const SHAPE: CatalogDiscipline = {
  id: "shape",
  name: "Shape the Flowing River",
  description: "d",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 1 },
  effect: { effectType: "utility", scaling: { mode: "none" } } as CatalogDiscipline["effect"],
  steps: [],
};

describe("affordableSteps", () => {
  it("filters to steps whose ki is within the pool, never clamping to a real per-cast cap", () => {
    expect(affordableSteps(FANGS, 3).map((s) => s.ki)).toEqual([1, 2, 3]);
    // 8 ki in the pool offers every served step (1-6) even though no monk can ever actually cast Fangs at 8 ki — the server is the one that refuses that.
    expect(affordableSteps(FANGS, 8).map((s) => s.ki)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("is empty when the pool can't even cover the base step", () => {
    expect(affordableSteps(FANGS, 0)).toEqual([]);
  });
});

describe("disciplineCastView", () => {
  it("a scalable discipline reports a ki range and offers a picker", () => {
    const view = disciplineCastView(FANGS, 4);
    expect(view.costBase).toBe(1);
    expect(view.hasDice).toBe(true);
    expect(view.scalable).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.kiLabel).toBe("1-4 ki");
    expect(view.options.map((s) => s.ki)).toEqual([1, 2, 3, 4]);
  });

  it("a flat-cost discipline reports a single amount and no picker", () => {
    const view = disciplineCastView(FIST, 5);
    expect(view.scalable).toBe(false);
    expect(view.kiLabel).toBe("2 ki");
    expect(view.options.map((s) => s.ki)).toEqual([2]);
  });

  it("a no-dice utility discipline still has a real ki cost, just no options to pick a roll from", () => {
    const view = disciplineCastView(SHAPE, 2);
    expect(view.hasDice).toBe(false);
    expect(view.costBase).toBe(1);
    expect(view.canAfford).toBe(true);
    expect(view.options).toEqual([]);
    expect(view.kiLabel).toBe("1 ki");
  });

  it("canAfford is false below the base cost, even for a no-dice discipline (steps alone can't tell)", () => {
    expect(disciplineCastView(SHAPE, 0).canAfford).toBe(false);
    expect(disciplineCastView(FANGS, 0).canAfford).toBe(false);
  });
});

describe("effectiveStep", () => {
  it("returns undefined for a no-dice discipline", () => {
    expect(effectiveStep(disciplineCastView(SHAPE, 5), undefined)).toBeUndefined();
  });

  it("returns the selected amount when it's still a valid affordable option", () => {
    const view = disciplineCastView(FANGS, 4);
    expect(effectiveStep(view, 3)).toEqual({ ki: 3, roll: { count: 3, faces: 10, modifier: 0 } });
  });

  it("falls back to the cheapest affordable option when the selection is stale (e.g. ki was spent elsewhere)", () => {
    const view = disciplineCastView(FANGS, 2);
    expect(effectiveStep(view, 5)).toEqual({ ki: 1, roll: { count: 1, faces: 10, modifier: 0 } });
  });

  it("returns the single option for a flat-cost discipline regardless of selection", () => {
    const view = disciplineCastView(FIST, 5);
    expect(effectiveStep(view, 999)).toEqual({ ki: 2, roll: { count: 2, faces: 8, modifier: 0 } });
  });
});
