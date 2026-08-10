import { beforeEach, describe, it, expect, vi } from "vitest";

import { resolveWeaponBondMutation } from "@/features/inventory/useWeaponBondTransactions";

const bondWeaponTransaction = vi.fn();
const unbondWeaponTransaction = vi.fn();
vi.mock("@/api/client", () => ({
  bondWeaponTransaction: (...args: unknown[]) => bondWeaponTransaction(...args),
  unbondWeaponTransaction: (...args: unknown[]) => unbondWeaponTransaction(...args),
}));

beforeEach(() => {
  bondWeaponTransaction.mockReset();
  unbondWeaponTransaction.mockReset();
});

// resolveWeaponBondMutation is the pure dispatch this hook's mutationFn calls
// (#1854) — a prior version destructured `const [op] = operations` directly,
// which crashed on `op.type` of undefined for an empty batch and silently
// dropped every op past the first for a >1 batch (claude-review finding on
// #1887). WeaponBondToggle only ever submits exactly one op, so both cases
// reject loudly rather than misbehave.
describe("resolveWeaponBondMutation", () => {
  it("dispatches a single bondWeapon op to bondWeaponTransaction", () => {
    resolveWeaponBondMutation("char-1", [{ type: "bondWeapon", inventoryItemId: "item-1" }]);
    expect(bondWeaponTransaction).toHaveBeenCalledWith("char-1", "item-1");
    expect(unbondWeaponTransaction).not.toHaveBeenCalled();
  });

  it("dispatches a single unbondWeapon op to unbondWeaponTransaction", () => {
    resolveWeaponBondMutation("char-1", [{ type: "unbondWeapon", inventoryItemId: "item-1" }]);
    expect(unbondWeaponTransaction).toHaveBeenCalledWith("char-1", "item-1");
    expect(bondWeaponTransaction).not.toHaveBeenCalled();
  });

  it("throws on an empty operations array instead of crashing on op.type", () => {
    expect(() => resolveWeaponBondMutation("char-1", [])).toThrow(/single-op only/);
    expect(bondWeaponTransaction).not.toHaveBeenCalled();
    expect(unbondWeaponTransaction).not.toHaveBeenCalled();
  });

  it("throws on a >1-length operations array instead of silently dropping ops", () => {
    expect(() =>
      resolveWeaponBondMutation("char-1", [
        { type: "bondWeapon", inventoryItemId: "item-1" },
        { type: "bondWeapon", inventoryItemId: "item-2" },
      ]),
    ).toThrow(/single-op only/);
    expect(bondWeaponTransaction).not.toHaveBeenCalled();
  });
});
