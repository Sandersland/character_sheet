import { afterEach, describe, expect, it, vi } from "vitest";

import { applyInventoryTransactions } from "@/api/inventory";
import type { InventoryOperation } from "@/types/character";

// Verbatim regression pin from client.test.ts (#1270) — assertions unchanged,
// only the import specifier retargeted.
describe("applyInventoryTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", inventory: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const operations: InventoryOperation[] = [{ type: "acquire", itemId: "item-1", quantity: 1 }];
    await applyInventoryTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/inventory/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Not enough currency for this transaction" }),
      })
    );

    await expect(
      applyInventoryTransactions("1", [
        { type: "sell", inventoryItemId: "i1", currencyDelta: { cp: 0, sp: 0, gp: 1, pp: 0 } },
      ])
    ).rejects.toThrow("Not enough currency for this transaction");
  });
});
