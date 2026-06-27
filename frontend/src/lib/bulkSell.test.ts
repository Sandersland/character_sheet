import { describe, expect, it } from "vitest";

import { buildSellOperations, type SellLine } from "@/lib/bulkSell";
import { toCopper } from "@/lib/currency";
import type { Currency } from "@/types/character";

const lines: SellLine[] = [
  { inventoryItemId: "a", quantity: 2 },
  { inventoryItemId: "b", quantity: 1 },
  { inventoryItemId: "c", quantity: 5 },
];

describe("buildSellOperations — empty", () => {
  it("returns [] for no lines (per-item) so the .min(1) endpoint is never hit", () => {
    expect(buildSellOperations([], { mode: "perItem", prices: {} })).toEqual([]);
  });

  it("returns [] for no lines (lump-sum)", () => {
    expect(
      buildSellOperations([], { mode: "lumpSum", total: { cp: 0, sp: 0, gp: 5, pp: 0 } })
    ).toEqual([]);
  });
});

describe("buildSellOperations — per-item", () => {
  it("emits one full-stack sell op per line with its own price", () => {
    const prices: Record<string, Currency> = {
      a: { cp: 0, sp: 0, gp: 2, pp: 0 },
      b: { cp: 5, sp: 0, gp: 0, pp: 0 },
      c: { cp: 0, sp: 3, gp: 0, pp: 0 },
    };
    const ops = buildSellOperations(lines, { mode: "perItem", prices });
    expect(ops).toEqual([
      { type: "sell", inventoryItemId: "a", quantity: 2, currencyDelta: prices.a },
      { type: "sell", inventoryItemId: "b", quantity: 1, currencyDelta: prices.b },
      { type: "sell", inventoryItemId: "c", quantity: 5, currencyDelta: prices.c },
    ]);
  });

  it("falls back to zero currency for a line with no price", () => {
    const ops = buildSellOperations([lines[0]], { mode: "perItem", prices: {} });
    expect(ops[0].currencyDelta).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
  });
});

describe("buildSellOperations — lump-sum", () => {
  it("sets quantity to each line's full stack", () => {
    const ops = buildSellOperations(lines, {
      mode: "lumpSum",
      total: { cp: 0, sp: 0, gp: 9, pp: 0 },
    });
    expect(ops.map((o) => o.quantity)).toEqual([2, 1, 5]);
    expect(ops.map((o) => o.inventoryItemId)).toEqual(["a", "b", "c"]);
  });

  it("splits the total so the sum of currencyDelta equals toCopper(total)", () => {
    const total: Currency = { cp: 0, sp: 0, gp: 10, pp: 0 }; // 1000 cp / 3 lines
    const ops = buildSellOperations(lines, { mode: "lumpSum", total });
    const summed = ops.reduce((acc, o) => acc + toCopper(o.currencyDelta), 0);
    expect(summed).toBe(toCopper(total));
  });
});
