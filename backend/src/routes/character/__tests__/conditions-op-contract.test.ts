// conditionKeySchema/setExhaustionOpSchema duplicate CONDITIONS/EXHAUSTION_MAX because the contracts zone can't import backend (#1390) — this file is the latch keeping that copy safe; deleting it re-opens the drift.
// resolveSetExhaustion re-range-checks the level and 400s exactly like a schema rejection, so conditions.test.ts and exhaustion-edition.test.ts stay green if .max(6) is dropped here.
import {
  applyConditionOpSchema,
  conditionKeySchema,
  conditionOperationSchema,
  removeConditionOpSchema,
  setExhaustionOpSchema,
  type ConditionKey,
} from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import { CONDITIONS, EXHAUSTION_MAX, type ConditionKey as SrdConditionKey } from "@/lib/srd/srd.js";

describe("condition-op wire contract", () => {
  it("keeps the wire key enum in step with the CONDITIONS authority", () => {
    expect([...conditionKeySchema.options].sort()).toEqual(CONDITIONS.map((c) => c.key).sort());
  });

  it("keeps the wire ConditionKey type identical to the srd one", () => {
    expectTypeOf<ConditionKey>().toEqualTypeOf<SrdConditionKey>();
  });

  it("keeps every migrated op's client-constructible input identical to its inferred type", () => {
    expectTypeOf<z.input<typeof applyConditionOpSchema>>().toEqualTypeOf<
      z.output<typeof applyConditionOpSchema>
    >();
    expectTypeOf<z.input<typeof removeConditionOpSchema>>().toEqualTypeOf<
      z.output<typeof removeConditionOpSchema>
    >();
    expectTypeOf<z.input<typeof setExhaustionOpSchema>>().toEqualTypeOf<
      z.output<typeof setExhaustionOpSchema>
    >();
    expectTypeOf<z.input<typeof conditionOperationSchema>>().toEqualTypeOf<
      z.output<typeof conditionOperationSchema>
    >();
  });

  it("bounds exhaustion to 0..EXHAUSTION_MAX", () => {
    const at = (level: number) => setExhaustionOpSchema.safeParse({ type: "setExhaustion", level }).success;
    expect(at(0)).toBe(true);
    expect(at(EXHAUSTION_MAX)).toBe(true);
    expect(at(EXHAUSTION_MAX + 1)).toBe(false);
    expect(at(-1)).toBe(false);
    expect(at(1.5)).toBe(false);
  });

  it("rejects a key that is not a standard condition, and exhaustion is not one", () => {
    expect(conditionOperationSchema.safeParse({ type: "applyCondition", key: "prone" }).success).toBe(true);
    expect(conditionOperationSchema.safeParse({ type: "applyCondition", key: "smitten" }).success).toBe(false);
    expect(conditionOperationSchema.safeParse({ type: "applyCondition", key: "exhaustion" }).success).toBe(false);
  });

  it("treats source as optional provenance but never accepts an empty one", () => {
    const base = { type: "applyCondition", key: "charmed" };
    expect(conditionOperationSchema.safeParse(base).success).toBe(true);
    expect(conditionOperationSchema.safeParse({ ...base, source: "Hold Person" }).success).toBe(true);
    expect(conditionOperationSchema.safeParse({ ...base, source: "" }).success).toBe(false);
  });
});
