import { describe, expect, it } from "vitest";

import { buildSellOperations, defaultSellPrice, type SellLine } from "@/lib/bulkSell";
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

describe("buildSellOperations — partial quantity + custom price", () => {
  it("sells fewer than the full stack at the typed per-line price", () => {
    // Line "c" holds 5 but the player only sells 2 for a custom 4 gp.
    const partial: SellLine[] = [
      { inventoryItemId: "c", quantity: 2 },
    ];
    const prices: Record<string, Currency> = { c: { cp: 0, sp: 0, gp: 4, pp: 0 } };
    const ops = buildSellOperations(partial, { mode: "perItem", prices });
    expect(ops).toEqual([
      { type: "sell", inventoryItemId: "c", quantity: 2, currencyDelta: prices.c },
    ]);
  });

  it("honors independent typed quantity + price on each line", () => {
    const mixed: SellLine[] = [
      { inventoryItemId: "a", quantity: 1 },
      { inventoryItemId: "c", quantity: 3 },
    ];
    const prices: Record<string, Currency> = {
      a: { cp: 5, sp: 0, gp: 0, pp: 0 },
      c: { cp: 0, sp: 0, gp: 1, pp: 1 },
    };
    const ops = buildSellOperations(mixed, { mode: "perItem", prices });
    expect(ops.map((o) => [o.inventoryItemId, o.quantity, o.currencyDelta])).toEqual([
      ["a", 1, prices.a],
      ["c", 3, prices.c],
    ]);
  });
});

describe("defaultSellPrice — half catalog value × quantity", () => {
  it("halves the per-unit catalog cost (rounded down) then scales by quantity", () => {
    // 2 gp = 200 cp → floor(200/2) = 100 cp per unit × 3 = 300 cp = 3 gp.
    expect(defaultSellPrice({ cp: 0, sp: 0, gp: 2, pp: 0 }, 3)).toEqual({
      cp: 0,
      sp: 0,
      gp: 3,
      pp: 0,
    });
  });

  it("rounds the per-unit half down before scaling (odd copper)", () => {
    // 5 cp → floor(5/2) = 2 cp per unit × 4 = 8 cp.
    expect(defaultSellPrice({ cp: 5, sp: 0, gp: 0, pp: 0 }, 4)).toEqual({
      cp: 8,
      sp: 0,
      gp: 0,
      pp: 0,
    });
  });

  it("treats a missing cost as free", () => {
    expect(defaultSellPrice(undefined, 5)).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
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
