/**
 * Latch for the executeAction op schema migrated into
 * @character-sheet/contracts (#1390).
 *
 * `expectTypeOf` is erased at runtime (there is no vitest `typecheck` block), so
 * the z.input/z.output half is gated by `npm run typecheck`, not by `vitest
 * run`. The safeParse assertions are the half vitest can fail: the route's own
 * tests assert `res.status`, and an unknown action key answers 400 from
 * `assertKnownActionKeys` just as a malformed body does, so dropping
 * `.min(1)`/`.int()`/`.positive()` here would leave them green.
 */
import { executeActionOpSchema, type ActionOperation, type ExecuteActionOperation } from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("action-op wire contract", () => {
  it("keeps the migrated op's client-constructible input identical to its inferred type", () => {
    expectTypeOf<z.input<typeof executeActionOpSchema>>().toEqualTypeOf<z.output<typeof executeActionOpSchema>>();
  });

  it("keeps the action-op union at exactly its one member", () => {
    expectTypeOf<ActionOperation>().toEqualTypeOf<ExecuteActionOperation>();
  });

  it("accepts a bare action key — roll and inventoryItemId are optional", () => {
    expect(executeActionOpSchema.safeParse({ type: "executeAction", actionKey: "dodge" }).success).toBe(true);
  });

  it("rejects an empty action key — no dispatch table entry could match it", () => {
    expect(executeActionOpSchema.safeParse({ type: "executeAction", actionKey: "" }).success).toBe(false);
  });

  it("rejects a non-positive or fractional roll — a client-rolled total is a whole die result", () => {
    const base = { type: "executeAction", actionKey: "drinkPotion" };
    expect(executeActionOpSchema.safeParse({ ...base, roll: 1 }).success).toBe(true);
    expect(executeActionOpSchema.safeParse({ ...base, roll: 0 }).success).toBe(false);
    expect(executeActionOpSchema.safeParse({ ...base, roll: -3 }).success).toBe(false);
    expect(executeActionOpSchema.safeParse({ ...base, roll: 2.5 }).success).toBe(false);
  });
});
