import { describe, expect, it } from "vitest";

import { splitAdvancementsBySlotCap, type AdvancementEntry } from "@/lib/classes/resources.js";

function entry(id: string, opts: Partial<AdvancementEntry> = {}): AdvancementEntry {
  return { id, level: 1, kind: "feat", abilityDeltas: {}, hpDelta: 0, initDelta: 0, ...opts };
}

describe("splitAdvancementsBySlotCap (#1130)", () => {
  it("keeps origin entries regardless of cap and never counts them as used slots", () => {
    const origin = entry("origin", { origin: true, featName: "Alert" });
    const { kept, excess, usedSlots } = splitAdvancementsBySlotCap([origin], 0);
    expect(kept).toEqual([origin]);
    expect(excess).toEqual([]);
    expect(usedSlots).toBe(0);
  });

  it("LIFO-trims non-origin entries beyond the cap while retaining origin entries", () => {
    const origin = entry("origin", { origin: true });
    const asi1 = entry("asi1", { kind: "asi" });
    const asi2 = entry("asi2", { kind: "asi" });
    const { kept, excess, usedSlots } = splitAdvancementsBySlotCap([origin, asi1, asi2], 1);
    expect(kept).toEqual([origin, asi1]);
    expect(excess).toEqual([asi2]);
    expect(usedSlots).toBe(1);
  });

  it("preserves interleaved order and counts only slot-consuming entries", () => {
    const asi1 = entry("asi1", { kind: "asi" });
    const origin = entry("origin", { origin: true });
    const asi2 = entry("asi2", { kind: "asi" });
    const { kept, usedSlots } = splitAdvancementsBySlotCap([asi1, origin, asi2], 2);
    expect(kept.map((e) => e.id)).toEqual(["asi1", "origin", "asi2"]);
    expect(usedSlots).toBe(2);
  });
});
