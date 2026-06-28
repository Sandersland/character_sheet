import { describe, expect, it } from "vitest";

import { summarizeSellBatch } from "@/lib/sellBatch";
import type { CharacterEvent, Currency } from "@/types/character";

let seq = 0;

/** Build a minimal `sold` CharacterEvent carrying `data`. */
function soldEvent(
  data: unknown,
  overrides: Partial<CharacterEvent> = {}
): CharacterEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    category: "inventory",
    type: "sold",
    summary: "Sold something",
    actor: "owner",
    reverted: false,
    createdAt: new Date().toISOString(),
    data,
    ...overrides,
  } as CharacterEvent;
}

const gp = (n: number): Currency => ({ cp: 0, sp: 0, gp: n, pp: 0 });

describe("summarizeSellBatch", () => {
  it("returns null for a single-row batch", () => {
    expect(summarizeSellBatch([soldEvent({ itemName: "Dagger", quantityDelta: -1, currencyDelta: gp(2) })])).toBeNull();
  });

  it("returns null when a multi-row batch contains a non-sold row", () => {
    const rows = [
      soldEvent({ itemName: "Dagger", quantityDelta: -1, currencyDelta: gp(2) }),
      soldEvent({ itemName: "Shield", quantityDelta: -1, currencyDelta: gp(3) }, { type: "acquired" }),
    ];
    expect(summarizeSellBatch(rows)).toBeNull();
  });

  it("summarizes a 3-row sold batch with count, total, label, and items", () => {
    const rows = [
      soldEvent({ itemName: "Dagger", quantityDelta: -1, currencyDelta: gp(2) }),
      soldEvent({ itemName: "Shield", quantityDelta: -2, currencyDelta: gp(3) }),
      soldEvent({ itemName: "Rope", quantityDelta: -1, currencyDelta: { cp: 0, sp: 5, gp: 0, pp: 0 } }),
    ];
    const summary = summarizeSellBatch(rows);
    expect(summary).not.toBeNull();
    expect(summary!.itemCount).toBe(3);
    // 2 gp + 3 gp + 5 sp = 550 cp → 5 gp 5 sp
    expect(summary!.total).toEqual({ cp: 0, sp: 5, gp: 5, pp: 0 });
    expect(summary!.totalLabel).toBe("5 gp 5 sp");
    expect(summary!.items).toEqual([
      { name: "Dagger", quantity: 1 },
      { name: "Shield", quantity: 2 },
      { name: "Rope", quantity: 1 },
    ]);
  });

  it("tolerates a row with missing/garbage data — currency treated as zero", () => {
    const rows = [
      soldEvent({ itemName: "Dagger", quantityDelta: -1, currencyDelta: gp(4) }),
      soldEvent(null),
      soldEvent({ itemName: 123, currencyDelta: "nope" }),
    ];
    const summary = summarizeSellBatch(rows);
    expect(summary).not.toBeNull();
    expect(summary!.itemCount).toBe(3);
    expect(summary!.total).toEqual(gp(4));
    expect(summary!.totalLabel).toBe("4 gp");
    expect(summary!.items).toEqual([
      { name: "Dagger", quantity: 1 },
      { name: "", quantity: 0 },
      { name: "", quantity: 0 },
    ]);
  });
});
