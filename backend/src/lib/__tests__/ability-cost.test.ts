/**
 * Pure unit tests for the slot + none branches of payAbilityCostInTx.
 *
 * These branches never touch the transaction client — they mutate the
 * hand-built slot/arcanum maps in place — so no Postgres is needed. The pool
 * branch is covered by the DB-backed ability-cost-pool.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  payAbilityCostInTx,
  InvalidSpellcastingOperationError,
  type PayCostContext,
} from "@/lib/ability-cost.js";

function ctx(overrides: Partial<PayCostContext> = {}): PayCostContext {
  return {
    tx: undefined as never,
    characterId: "char-1",
    batchId: "batch-1",
    sessionId: null,
    slotsUsed: {},
    arcanumUsed: {},
    slotTotals: {},
    arcanaTotals: {},
    ...overrides,
  };
}

describe("payAbilityCostInTx — slot branch", () => {
  it("same-level cast: effectiveStep 0, label 'L1 slot', increments slotsUsed", async () => {
    const c = ctx({ slotTotals: { 1: 2 } });
    const paid = await payAbilityCostInTx(c, { kind: "slot", minLevel: 1 }, 1);
    expect(paid).toEqual({ label: "L1 slot", effectiveStep: 0 });
    expect(c.slotsUsed!["1"]).toBe(1);
  });

  it("upcast: minLevel 1 in a L3 slot → effectiveStep 2, upcast label", async () => {
    const c = ctx({ slotTotals: { 3: 1 } });
    const paid = await payAbilityCostInTx(c, { kind: "slot", minLevel: 1 }, 3);
    expect(paid).toEqual({ label: "L3 slot (upcast from L1)", effectiveStep: 2 });
    expect(c.slotsUsed!["3"]).toBe(1);
  });

  it("exhausted slots throw the 'No level-N spell slots remaining' message", async () => {
    const c = ctx({ slotTotals: { 1: 1 }, slotsUsed: { "1": 1 } });
    await expect(
      payAbilityCostInTx(c, { kind: "slot", minLevel: 1 }, 1)
    ).rejects.toThrow(InvalidSpellcastingOperationError);
    await expect(
      payAbilityCostInTx(c, { kind: "slot", minLevel: 1 }, 1)
    ).rejects.toThrow("No level-1 spell slots remaining");
  });

  it("Mystic Arcanum fallback when no slot exists at that level", async () => {
    const c = ctx({ slotTotals: { 6: 0 }, arcanaTotals: { 6: 1 } });
    const paid = await payAbilityCostInTx(c, { kind: "slot", minLevel: 6 }, 6);
    expect(paid).toEqual({ label: "L6 Mystic Arcanum", effectiveStep: 0 });
    expect(c.arcanumUsed!["6"]).toBe(1);
    // Second cast — arcanum charge already spent.
    await expect(
      payAbilityCostInTx(c, { kind: "slot", minLevel: 6 }, 6)
    ).rejects.toThrow("Mystic Arcanum (level 6) already used — recharges on a long rest");
  });

  it("requested below minLevel throws", async () => {
    const c = ctx({ slotTotals: { 1: 5 } });
    await expect(
      payAbilityCostInTx(c, { kind: "slot", minLevel: 2 }, 1)
    ).rejects.toThrow(InvalidSpellcastingOperationError);
  });
});

describe("payAbilityCostInTx — none branch", () => {
  it("returns an empty label and zero step", async () => {
    const paid = await payAbilityCostInTx(ctx(), { kind: "none" });
    expect(paid).toEqual({ label: "", effectiveStep: 0 });
  });
});
