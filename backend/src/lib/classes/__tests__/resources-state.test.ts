import { describe, it, expect } from "vitest";

import { normalizeResourcesMutable, serializeResourcesState, snapshotResources } from "@/lib/classes/resources-state.js";

describe("expertiseKnown persisted state", () => {
  it("round-trips through normalize -> serialize", () => {
    const state = normalizeResourcesMutable({ expertiseKnown: [{ id: "e1", skill: "stealth" }] });
    expect(state.expertiseKnown).toEqual([{ id: "e1", skill: "stealth" }]);
    const json = serializeResourcesState(state) as Record<string, unknown>;
    expect(json.expertiseKnown).toEqual([{ id: "e1", skill: "stealth" }]);
  });

  it("defaults expertiseKnown to [] for legacy/empty resources", () => {
    expect(normalizeResourcesMutable(null).expertiseKnown).toEqual([]);
    expect(normalizeResourcesMutable({}).expertiseKnown).toEqual([]);
  });

  it("snapshotResources deep-clones expertiseKnown (undo safety)", () => {
    const state = normalizeResourcesMutable({ expertiseKnown: [{ id: "e1", skill: "stealth" }] });
    const snap = snapshotResources(state);
    state.expertiseKnown[0].skill = "MUTATED";
    expect(snap.expertiseKnown[0].skill).toBe("stealth");
  });
});
