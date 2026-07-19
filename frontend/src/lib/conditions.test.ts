import { describe, it, expect } from "vitest";

import {
  CONDITION_DESCRIPTIONS,
  CONDITION_LABELS,
  CONDITION_OPTIONS,
  conditionLabel,
  EXHAUSTION_MAX,
  exhaustionEffect,
  exhaustionLabel,
} from "@/lib/conditions";

describe("conditionLabel", () => {
  it("resolves known keys to their display label", () => {
    expect(conditionLabel("poisoned")).toBe("Poisoned");
    expect(conditionLabel("prone")).toBe("Prone");
  });

  it("degrades unknown keys to themselves", () => {
    expect(conditionLabel("onFire")).toBe("onFire");
  });

  it("covers all 14 standard conditions", () => {
    expect(Object.keys(CONDITION_LABELS)).toHaveLength(14);
    expect(CONDITION_OPTIONS).toHaveLength(14);
  });

  it("orders options alphabetically by label", () => {
    const labels = CONDITION_OPTIONS.map((c) => c.label);
    expect(labels[0]).toBe("Blinded");
    expect([...labels]).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("CONDITION_DESCRIPTIONS (2024 / SRD 5.2)", () => {
  it("scopes Grappled's attack disadvantage to targets other than the grappler", () => {
    expect(CONDITION_DESCRIPTIONS.grappled).toContain("other than the grappler");
  });

  it("mentions Invisible's advantage on initiative", () => {
    expect(CONDITION_DESCRIPTIONS.invisible.toLowerCase()).toContain("initiative");
  });

  it("mentions Incapacitated breaking Concentration and can't speak", () => {
    expect(CONDITION_DESCRIPTIONS.incapacitated).toContain("Concentration");
    expect(CONDITION_DESCRIPTIONS.incapacitated.toLowerCase()).toContain("can't speak");
  });

  it("no longer says Stunned can't move (2024 trim)", () => {
    expect(CONDITION_DESCRIPTIONS.stunned.toLowerCase()).not.toContain("can't move");
  });

  it("gives Petrified immunity to the Poisoned condition", () => {
    expect(CONDITION_DESCRIPTIONS.petrified).toContain("Poisoned");
  });
});

describe("exhaustion helpers", () => {
  it("formats the level label", () => {
    expect(exhaustionLabel(3)).toBe("Exhaustion 3");
  });

  it("clamps out-of-range levels", () => {
    expect(exhaustionLabel(99)).toBe(`Exhaustion ${EXHAUSTION_MAX}`);
    expect(exhaustionLabel(-5)).toBe("Exhaustion 0");
  });

  it("computes the flat 2024 effect text per level (#1136)", () => {
    expect(exhaustionEffect(0)).toBe("No exhaustion.");
    expect(exhaustionEffect(1)).toBe("−2 on d20 Tests; Speed −5 ft.");
    expect(exhaustionEffect(3)).toBe("−6 on d20 Tests; Speed −15 ft.");
    expect(exhaustionEffect(6)).toBe("Death.");
    expect(exhaustionEffect(99)).toBe("Death.");
  });
});
