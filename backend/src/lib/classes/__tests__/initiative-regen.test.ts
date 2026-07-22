// Unit tests for the generic onInitiative regen mechanism (#1239). Pure —
// no DB. Uses test-fixture pools rather than the real Monk Focus pool: the
// L2-vs-L15 (Uncanny Metabolism vs Perfect Focus) descriptor split is #1243's
// job, so nothing declares onInitiative on a real class pool yet.

import { describe, it, expect } from "vitest";

import {
  applyInitiativeRegen,
  clearInitiativeRegenMarkers,
  normalizeResourcesMutable,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import type { DerivedClassInfo, DerivedResource } from "@/lib/classes/class-features.js";

function info(resources: DerivedResource[]): DerivedClassInfo {
  return { resources, features: [] };
}

function stateWithUsed(used: Record<string, number>): ResourcesMutableState {
  const state = normalizeResourcesMutable(null);
  state.used = { ...used };
  return state;
}

// Uncanny Metabolism shape (SRD 5.2): regain ALL expended Focus, once per long rest.
const uncannyPool: DerivedResource = {
  key: "focus",
  label: "Focus Points",
  total: 6,
  recharge: "short-or-long",
  onInitiative: { amount: "all", oncePerLongRest: true },
};

// Perfect Focus shape (SRD 5.2): top up to 3 available, every combat (no cap).
const perfectPool: DerivedResource = {
  key: "focus",
  label: "Focus Points",
  total: 6,
  recharge: "short-or-long",
  onInitiative: { amount: 3 },
};

// A pool with no onInitiative descriptor — must be untouched.
const plainPool: DerivedResource = {
  key: "superiorityDice",
  label: "Superiority Dice",
  total: 4,
  die: "d8",
  recharge: "shortRest",
};

describe("applyInitiativeRegen (#1239)", () => {
  it("refills a resource declaring initiative-regen on combat-start", () => {
    const state = stateWithUsed({ focus: 6 });
    const regained = applyInitiativeRegen(state, info([uncannyPool]));
    expect(state.used.focus).toBe(0);
    expect(regained).toEqual([{ key: "focus", label: "Focus Points", restored: 6, remaining: 6 }]);
  });

  it("enforces the once-per-long-rest cap across two combats before a long rest", () => {
    const state = stateWithUsed({ focus: 6 });

    // Combat 1: refills all Focus and marks the once-per-rest use as spent.
    applyInitiativeRegen(state, info([uncannyPool]));
    expect(state.used.focus).toBe(0);

    // Spend Focus again, then Combat 2 — the cap blocks a second refill.
    state.used.focus = 4;
    applyInitiativeRegen(state, info([uncannyPool]));
    expect(state.used.focus).toBe(4);

    // A long rest clears the marker; the next combat may refill again.
    clearInitiativeRegenMarkers(state);
    applyInitiativeRegen(state, info([uncannyPool]));
    expect(state.used.focus).toBe(0);
  });

  it("consumes the once-per-rest use even when nothing was expended to regain", () => {
    const state = stateWithUsed({ focus: 0 });
    applyInitiativeRegen(state, info([uncannyPool])); // fires with nothing to regain
    expect(state.used.focus).toBe(0);

    // Spend Focus, next combat — still capped for this long-rest cycle.
    state.used.focus = 5;
    applyInitiativeRegen(state, info([uncannyPool]));
    expect(state.used.focus).toBe(5);
  });

  it("does not double-apply within one combat-start (top-up is idempotent)", () => {
    const state = stateWithUsed({ focus: 6 }); // 0 remaining, below the target of 3
    const first = applyInitiativeRegen(state, info([perfectPool]));
    expect(state.used.focus).toBe(3); // remaining = 6 - 3 = 3
    expect(first).toEqual([{ key: "focus", label: "Focus Points", restored: 3, remaining: 3 }]);

    // Already at/above target — a second application in the same combat is a no-op.
    const second = applyInitiativeRegen(state, info([perfectPool]));
    expect(state.used.focus).toBe(3);
    expect(second).toEqual([]);
  });

  it("is inert for a resource with no onInitiative (state byte-identical)", () => {
    const state = stateWithUsed({ superiorityDice: 4, focus: 2 });
    const before = JSON.stringify(state);
    const regained = applyInitiativeRegen(state, info([plainPool]));
    expect(regained).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("is inert when derived info is null", () => {
    const state = stateWithUsed({ focus: 3 });
    const before = JSON.stringify(state);
    expect(applyInitiativeRegen(state, null)).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });
});
