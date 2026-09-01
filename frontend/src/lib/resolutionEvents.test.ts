import { describe, expect, it } from "vitest";

import { sumInstanceEffects } from "@/lib/resolutionEvents";
import type { ResolveActionEventEffect } from "@character-sheet/shared-types";

function effect(total: number): ResolveActionEventEffect {
  return { spec: "1d4+1", faces: [total - 1], total, type: "force", kind: "damage", crit: false };
}

describe("sumInstanceEffects (#1985)", () => {
  it("sums every instance that rolled an effect", () => {
    expect(sumInstanceEffects([{ effect: effect(4) }, { effect: effect(3) }, { effect: effect(5) }])).toBe(12);
  });

  it("skips a called-miss instance (no effect rolled) and sums the rest", () => {
    expect(sumInstanceEffects([{ effect: effect(9) }, {}, { effect: effect(6) }])).toBe(15);
  });

  it("returns undefined, not 0, when no instance landed an effect — matches the un-instanced miss convention", () => {
    expect(sumInstanceEffects([{}, {}])).toBeUndefined();
    expect(sumInstanceEffects([])).toBeUndefined();
  });
});
