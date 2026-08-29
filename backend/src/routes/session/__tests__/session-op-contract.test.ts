// patchSessionSchema's whole-object .refine() doesn't touch the input/output shape, so z.input and z.output must coincide (#1394); expectTypeOf is erased at runtime, gated by `npm run typecheck`.
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
