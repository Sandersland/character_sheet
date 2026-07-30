import { describe, expect, it } from "vitest";

import { restPoolRegain } from "@/lib/combat/rest.js";
import type { DerivedResource } from "@/lib/classes/types.js";

// #1221: the partial short-rest recharge model. No class declares
// `shortRestRegain` yet (scope forbids authoring one here) — every AC below
// exercises a synthetic pool, which is the whole reason `restPoolRegain` was
// extracted as an exported pure function rather than left inline in
// `resetRestResources`'s loop.

function pool(overrides: Partial<DerivedResource> = {}): DerivedResource {
  return { key: "test", label: "Test", total: 4, recharge: "longRest", ...overrides };
}

describe("restPoolRegain (#1221)", () => {
  it("longRest pool + shortRestRegain: 1 — short rest regains 1 of 3 used", () => {
    expect(restPoolRegain(pool({ shortRestRegain: 1 }), 3, "short")).toEqual({ nextUsed: 2, restored: 1 });
  });

  it("same pool — long rest fully restores all 3 used", () => {
    expect(restPoolRegain(pool({ shortRestRegain: 1 }), 3, "long")).toEqual({ nextUsed: 0, restored: 3 });
  });

  it("same pool, used: 1 — short rest reports restored: 1, not a phantom top-up against 0", () => {
    expect(restPoolRegain(pool({ shortRestRegain: 1 }), 1, "short")).toEqual({ nextUsed: 0, restored: 1 });
  });

  it("same pool, used: 0 — short rest is a true no-op (restored: 0)", () => {
    expect(restPoolRegain(pool({ shortRestRegain: 1 }), 0, "short")).toEqual({ nextUsed: 0, restored: 0 });
  });

  it("recharge: shortRest + shortRestRegain: 1 — full reset wins, never subtracts twice", () => {
    const p = pool({ recharge: "shortRest", shortRestRegain: 1 });
    expect(restPoolRegain(p, 3, "short")).toEqual({ nextUsed: 0, restored: 3 });
  });

  it("shortRestRegain absent — today's behaviour exactly: a longRest pool is inert on a short rest", () => {
    expect(restPoolRegain(pool(), 2, "short")).toEqual({ nextUsed: 2, restored: 0 });
  });

  it("onInitiative + shortRestRegain on the same pool are orthogonal: restPoolRegain ignores onInitiative entirely", () => {
    const p = pool({ shortRestRegain: 1, onInitiative: { amount: "all" } });
    // restPoolRegain never reads onInitiative — same result as the plain shortRestRegain case.
    expect(restPoolRegain(p, 3, "short")).toEqual({ nextUsed: 2, restored: 1 });
  });
});
