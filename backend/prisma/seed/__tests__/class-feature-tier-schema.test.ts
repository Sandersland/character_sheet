// Pure unit test (NO database) for #1522's settled tier-array ordering rule:
// resourceTotals/resourceDieTiers/derivedStatTiers are authored ASCENDING by
// minLevel, last-match-wins. Settled because the two shapes being merged
// disagreed — EXTRA_ATTACK_TIERS is descending/first-match while #1522's own
// resourceTotals example is ascending — so all three ClassFeature tier
// columns share ONE zod-enforced invariant rather than inheriting the
// ambiguity. Nothing in this migration populates these columns yet (#1528+
// is the first consumer); this only proves the validator itself rejects a
// descending array.
//
// Driven through classFeatureSeedSchema.safeParse, not the three tier
// schemas directly: those are intentionally un-exported (class-features.ts)
// since classFeatureSeedSchema is the surface that actually ships, and
// testing through it exercises the SAME `.refine` predicate as the
// production validation path (prisma/seed/validate.ts) rather than a second,
// bypassable entry point.
import { describe, expect, it } from "vitest";

import { classFeatureSeedSchema } from "../class-features.js";

const baseRow = {
  className: "Fighter",
  subclassSlug: null,
  name: "Test Feature",
  level: 1,
  description: "test",
  edition: "EDITION_2024" as const,
};

describe("ClassFeature tier-array schemas reject a descending minLevel order (#1522)", () => {
  it("resourceTotals accepts strictly ascending minLevel", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 1, total: 2 },
        { minLevel: 4, total: 3 },
        { minLevel: 10, total: 4 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("resourceTotals rejects a DESCENDING array — the EXTRA_ATTACK_TIERS shape", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 20, total: 4 },
        { minLevel: 11, total: 3 },
        { minLevel: 5, total: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("resourceTotals rejects a repeated minLevel (not strictly increasing)", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [
        { minLevel: 1, total: 2 },
        { minLevel: 1, total: 3 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("resourceDieTiers rejects descending order", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceDieTiers: [
        { minLevel: 18, die: "d12" },
        { minLevel: 10, die: "d10" },
        { minLevel: 1, die: "d8" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("derivedStatTiers rejects descending order", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      derivedStatTiers: [
        { minLevel: 11, value: 3 },
        { minLevel: 5, value: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("derivedStatTiers accepts ascending order with a string value", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      derivedStatTiers: [
        { minLevel: 5, value: "19-20" },
        { minLevel: 15, value: "18-20" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// #1685/#416 C3: total may be a formula instead of a flat number. Driven
// through classFeatureSeedSchema.safeParse for the same reason as the suite
// above — the one surface that actually ships (prisma/seed/validate.ts's
// assertSeedContentValid runs it at seed time, so a malformed formula fails
// the seed, never a character's read path).
describe("resourceTotals' `total` accepts the #1685 formula vocabulary and rejects malformed formulas", () => {
  it('accepts "proficiencyBonus"', () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: "proficiencyBonus" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { abilityMod, min }", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { abilityMod } with no min", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "wisdom" } }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts { levelTimes }", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { levelTimes: 5 } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized formula string (e.g. a typo\'d "proficiencyBonus")', () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: "proficiencyBonu" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized abilityMod name", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { abilityMod: "luck" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive levelTimes", () => {
    const result = classFeatureSeedSchema.safeParse({
      ...baseRow,
      resourceTotals: [{ minLevel: 1, total: { levelTimes: 0 } }],
    });
    expect(result.success).toBe(false);
  });
});
