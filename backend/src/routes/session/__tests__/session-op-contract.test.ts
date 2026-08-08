/**
 * Latch for the session PATCH schema migrated into @character-sheet/contracts
 * (#1394, epic #1369). The whole-object `.refine()` doesn't touch the
 * input/output shape, so z.input and z.output coincide here — asserted, not
 * assumed (expectTypeOf is erased at runtime; `npm run typecheck` gates it).
 */
import { patchSessionSchema, type PatchSessionInput } from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("session op wire contract", () => {
  it("keeps the migrated schema's client-constructible input identical to its output", () => {
    expectTypeOf<z.input<typeof patchSessionSchema>>().toEqualTypeOf<
      z.output<typeof patchSessionSchema>
    >();
  });

  it("exports PatchSessionInput as z.input, matching this package's locked policy", () => {
    expectTypeOf<PatchSessionInput>().toEqualTypeOf<z.input<typeof patchSessionSchema>>();
  });

  it("requires at least one of title/arcId", () => {
    expect(patchSessionSchema.safeParse({}).success).toBe(false);
    expect(patchSessionSchema.safeParse({ title: "Chapter One" }).success).toBe(true);
    expect(patchSessionSchema.safeParse({ arcId: null }).success).toBe(true);
  });
});
