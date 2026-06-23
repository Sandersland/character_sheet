import { describe, it, expect } from "vitest";

import {
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

describe("exhaustion helpers", () => {
  it("formats the level label", () => {
    expect(exhaustionLabel(3)).toBe("Exhaustion 3");
  });

  it("clamps out-of-range levels", () => {
    expect(exhaustionLabel(99)).toBe(`Exhaustion ${EXHAUSTION_MAX}`);
    expect(exhaustionLabel(-5)).toBe("Exhaustion 0");
  });

  it("returns cumulative effect text per level", () => {
    expect(exhaustionEffect(0)).toBe("No exhaustion.");
    expect(exhaustionEffect(6)).toBe("Death.");
    expect(exhaustionEffect(99)).toBe("Death.");
  });
});
