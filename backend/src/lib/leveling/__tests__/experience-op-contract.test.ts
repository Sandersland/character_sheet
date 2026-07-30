/**
 * Latch for the XP op schemas migrated into @character-sheet/contracts (#1390).
 *
 * Two independent failure modes, and they need different gates:
 *  1. z.infer aliases z.output, but the frontend must construct z.input — they
 *     diverge on `.transform()`/`.default()`/`.catch()`/`z.coerce.*`/`.pipe()`.
 *     The assertions below ASSERT that equality rather than assume it, so
 *     adding any of those to one of these schemas goes red. `expectTypeOf` is
 *     erased at runtime (there is no vitest `typecheck` block), so this half is
 *     gated by `npm run typecheck`, NOT by `vitest run`.
 *  2. Range/sign drift. `applyExperienceOperations` re-checks XP >= 0 and both
 *     paths answer 400, so a route test asserting only `res.status` cannot see
 *     `.nonnegative()` disappear from the schema. The safeParse assertions can.
 */
import { experienceOperationSchema, awardXpOpSchema, setXpOpSchema } from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("experience-op wire contract", () => {
  it("keeps each migrated op's client-constructible input identical to its inferred type", () => {
    expectTypeOf<z.input<typeof awardXpOpSchema>>().toEqualTypeOf<z.output<typeof awardXpOpSchema>>();
    expectTypeOf<z.input<typeof setXpOpSchema>>().toEqualTypeOf<z.output<typeof setXpOpSchema>>();
    expectTypeOf<z.input<typeof experienceOperationSchema>>().toEqualTypeOf<
      z.output<typeof experienceOperationSchema>
    >();
  });

  it("accepts a negative award — XP awards are signed deltas, corrections included", () => {
    expect(experienceOperationSchema.safeParse({ type: "award", amount: -450 }).success).toBe(true);
    expect(experienceOperationSchema.safeParse({ type: "award", amount: 450 }).success).toBe(true);
  });

  it("rejects a fractional award — XP is integral", () => {
    expect(experienceOperationSchema.safeParse({ type: "award", amount: 1.5 }).success).toBe(false);
  });

  it("rejects a negative set — total XP is absolute and never below zero", () => {
    expect(experienceOperationSchema.safeParse({ type: "set", value: -1 }).success).toBe(false);
    expect(experienceOperationSchema.safeParse({ type: "set", value: 0 }).success).toBe(true);
  });

  it("rejects an unknown op type", () => {
    expect(experienceOperationSchema.safeParse({ type: "double", amount: 1 }).success).toBe(false);
  });
});
