import { describe, expect, it } from "vitest";

import { classFeatureSeedSchema } from "../class-features.js";

const baseRow = {
  className: "Cleric",
  subclassSlug: null,
  name: "Test Feature",
  level: 1,
  description: "test",
  edition: "EDITION_2014" as const,
};

describe("classFeatureSeedSchema.improvements (#1691) — reuses featImprovementSchema, not a fork", () => {
  it("accepts a numeric target with no key", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      improvements: [{ target: "initiative", amount: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a keyed proficiency target that carries its key", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target — proves the seed-time gate, not a runtime 500 (AC)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      improvements: [{ target: "bogusTarget", amount: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a keyed proficiency target with no key — the same .refine featImprovementSchema enforces route-side", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      improvements: [{ target: "skillProficiency", amount: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("omitting improvements entirely is valid — additive, nullable column", () => {
    const result = classFeatureSeedSchema.safeParse(baseRow);
    expect(result.success).toBe(true);
  });
});
