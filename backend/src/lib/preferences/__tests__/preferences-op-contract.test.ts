/**
 * Latch for the Preferences schema migrated into @character-sheet/contracts
 * (#1395, epic #1369) — the reference case that settles this package's
 * z.input vs z.output policy (index.ts). `preferencesSchema`'s three
 * `.default()`s are exactly where the two diverge, so this is the one family
 * where the divergence must be proven, not just shown absent as the other
 * `*-op-contract.test.ts` files do.
 */
import { preferencesSchema, type UserPreferences } from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("preferences schema wire contract", () => {
  it("diverges z.input from z.output on every defaulted field", () => {
    expectTypeOf<z.input<typeof preferencesSchema>>().not.toEqualTypeOf<
      z.output<typeof preferencesSchema>
    >();
  });

  it("exports UserPreferences as z.input (every field optional), per the package's locked policy", () => {
    expectTypeOf<UserPreferences>().toEqualTypeOf<z.input<typeof preferencesSchema>>();
    expectTypeOf<UserPreferences>().not.toEqualTypeOf<z.output<typeof preferencesSchema>>();
    expectTypeOf<UserPreferences>().toEqualTypeOf<{
      theme?: "light" | "dark" | "system" | undefined;
      diceRollStyle?: "animated" | "quick" | undefined;
      autoRollConcentration?: boolean | undefined;
    }>();
  });

  it("still fills every default when parsed with an empty object", () => {
    expect(preferencesSchema.parse({})).toEqual({
      theme: "system",
      diceRollStyle: "animated",
      autoRollConcentration: true,
    });
  });

  it("rejects an invalid enum value", () => {
    expect(preferencesSchema.safeParse({ theme: "purple" }).success).toBe(false);
  });
});
