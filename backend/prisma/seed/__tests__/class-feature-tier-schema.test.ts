// Pure unit test (NO database) for #1522's settled tier-array ordering rule:
// resourceTotals/resourceDieTiers/derivedStatTiers are authored ASCENDING by
// minLevel, last-match-wins. Settled because the two shapes being merged
// disagreed — EXTRA_ATTACK_TIERS is descending/first-match while #1522's own
// resourceTotals example is ascending — so all three ClassFeature tier
// columns share ONE zod-enforced invariant rather than inheriting the
// ambiguity. Nothing in this migration populates these columns yet (#1528+
// is the first consumer); this only proves the validator itself rejects a
// descending array.
import { describe, expect, it } from "vitest";

import { derivedStatTiersSchema, resourceDieTiersSchema, resourceTotalsTierSchema } from "../class-features.js";

describe("ClassFeature tier-array schemas reject a descending minLevel order (#1522)", () => {
  it("resourceTotalsTierSchema accepts strictly ascending minLevel", () => {
    const result = resourceTotalsTierSchema.safeParse([
      { minLevel: 1, total: 2 },
      { minLevel: 4, total: 3 },
      { minLevel: 10, total: 4 },
    ]);
    expect(result.success).toBe(true);
  });

  it("resourceTotalsTierSchema rejects a DESCENDING array — the EXTRA_ATTACK_TIERS shape", () => {
    const result = resourceTotalsTierSchema.safeParse([
      { minLevel: 20, total: 4 },
      { minLevel: 11, total: 3 },
      { minLevel: 5, total: 2 },
    ]);
    expect(result.success).toBe(false);
  });

  it("resourceTotalsTierSchema rejects a repeated minLevel (not strictly increasing)", () => {
    const result = resourceTotalsTierSchema.safeParse([
      { minLevel: 1, total: 2 },
      { minLevel: 1, total: 3 },
    ]);
    expect(result.success).toBe(false);
  });

  it("resourceDieTiersSchema rejects descending order", () => {
    const result = resourceDieTiersSchema.safeParse([
      { minLevel: 18, die: "d12" },
      { minLevel: 10, die: "d10" },
      { minLevel: 1, die: "d8" },
    ]);
    expect(result.success).toBe(false);
  });

  it("derivedStatTiersSchema rejects descending order", () => {
    const result = derivedStatTiersSchema.safeParse([
      { minLevel: 11, value: 3 },
      { minLevel: 5, value: 2 },
    ]);
    expect(result.success).toBe(false);
  });

  it("derivedStatTiersSchema accepts ascending order with a string value", () => {
    const result = derivedStatTiersSchema.safeParse([
      { minLevel: 5, value: "19-20" },
      { minLevel: 15, value: "18-20" },
    ]);
    expect(result.success).toBe(true);
  });
});
