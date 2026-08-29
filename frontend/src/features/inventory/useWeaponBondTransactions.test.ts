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

// WeaponBondToggle only ever submits exactly one op, so an empty or >1 batch rejects loudly rather than misbehaving.
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
