// Shape pin for the catalog grant/fork contracts locked in #1796 (epic #1795
// 1/6). No route consumes them yet (Waves 4-6 build the actual endpoints) —
// this is the schema's own regression test, same role spell-ops.ts's
// customSpellSchema gets indirectly through custom-spells.test.ts's route
// assertions, done directly here since there is no route yet.
import { describe, expect, it } from "vitest";
import { catalogForkSchema, catalogGrantSchema } from "@character-sheet/contracts";

describe("catalogGrantSchema (#1796)", () => {
  it("accepts a bare campaignId", () => {
    const result = catalogGrantSchema.safeParse({ campaignId: "campaign-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing campaignId", () => {
    expect(catalogGrantSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown extra field (strict)", () => {
    expect(catalogGrantSchema.safeParse({ campaignId: "campaign-1", extra: true }).success).toBe(false);
  });
});

describe("catalogForkSchema (#1796)", () => {
  it("accepts scope USER with no campaignId", () => {
    const result = catalogForkSchema.safeParse({ scope: "USER" });
    expect(result.success).toBe(true);
  });

  it("accepts scope CAMPAIGN with a campaignId", () => {
    const result = catalogForkSchema.safeParse({ scope: "CAMPAIGN", campaignId: "campaign-1" });
    expect(result.success).toBe(true);
  });

  it("rejects scope CAMPAIGN with no campaignId", () => {
    expect(catalogForkSchema.safeParse({ scope: "CAMPAIGN" }).success).toBe(false);
  });

  it("rejects scope USER with a campaignId", () => {
    expect(catalogForkSchema.safeParse({ scope: "USER", campaignId: "campaign-1" }).success).toBe(false);
  });

  it("rejects an unrecognized scope", () => {
    expect(catalogForkSchema.safeParse({ scope: "GLOBAL" }).success).toBe(false);
  });
});
