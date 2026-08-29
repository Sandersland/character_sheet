// #1390: latch for the XP op schemas in @character-sheet/contracts. expectTypeOf is erased at runtime, so the z.input/z.output equality is gated by `npm run typecheck`, not `vitest run`.
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
