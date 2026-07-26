// Pure (no DB) tests for deriveEntryScopedActions (#1315): the shared rule
// function backing `availableActions[]` (serialize/classes.ts) that re-derives
// each class entry's own DERIVED_ACTIONS rows at THAT entry's own effective
// level, instead of only the primary entry at total level — mirrors
// deriveEntryScopedResources (#1206/#1177). This is also the function
// shadow-arts.ts's cast guards resolve through (shadow-arts.ts), so a secondary
// Warrior of Shadow monk's shadowArts/cloakOfShadows gate the same way for both
// the wire value and the cast guard — see CLAUDE.md's level-gated-registry rule.
import { describe, expect, it } from "vitest";

import { deriveActions, deriveEntryScopedActions } from "@/lib/classes/actions.js";

describe("deriveEntryScopedActions", () => {
  it("single-class parity: output is identical to a bare deriveActions call", () => {
    const entries = [{ name: "monk", subclass: "warrior of shadow", level: 6 }];
    const entryScoped = deriveEntryScopedActions(entries, 6, [], true);
    const bare = deriveActions("monk", "warrior of shadow", 6, [], true);
    expect(entryScoped).toEqual(bare);
  });

  it("Fighter 5 (primary) / Warrior of Shadow monk 3 (secondary): shadowArts is present, keyed off the monk entry's own level (3) not total level (8)", () => {
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 3 },
    ];
    const actions = deriveEntryScopedActions(entries, 8, [], true);
    expect(actions.some((a) => a.key === "shadowArts")).toBe(true);
    // cloakOfShadows needs monk entry level 17 — nowhere near reached at entry level 3,
    // even though the (irrelevant) total level of 8 is well past shadowArts' own gate.
    expect(actions.some((a) => a.key === "cloakOfShadows")).toBe(false);
  });

  it("Fighter 5 (primary) / Warrior of Shadow monk 2 (secondary, below L3): shadowArts absent", () => {
    const entries = [
      { name: "fighter", subclass: undefined, level: 5 },
      { name: "monk", subclass: "warrior of shadow", level: 2 },
    ];
    const actions = deriveEntryScopedActions(entries, 7, [], true);
    expect(actions.some((a) => a.key === "shadowArts")).toBe(false);
  });

  it("a secondary Fighter's actionSurge appears even though Fighter isn't the primary entry", () => {
    // Generalizes the same fix beyond monk: buildAvailableActionsView used to
    // derive only from the PRIMARY entry, so a secondary Fighter's actions never
    // appeared regardless of its own level.
    const entries = [
      { name: "wizard", subclass: undefined, level: 5 },
      { name: "fighter", subclass: undefined, level: 2 },
    ];
    const actions = deriveEntryScopedActions(entries, 7, [], true);
    expect(actions.some((a) => a.key === "actionSurge")).toBe(true);
  });

  it("dedupes by key when two entries could both match (base/primary wins ties, mirrors mergeLayers)", () => {
    const entries = [
      { name: "monk", subclass: "warrior of shadow", level: 6 },
      { name: "monk", subclass: "warrior of shadow", level: 6 },
    ];
    const actions = deriveEntryScopedActions(entries, 12, [], true);
    expect(actions.filter((a) => a.key === "shadowStep")).toHaveLength(1);
  });
});
