/**
 * Monk Focus onInitiative shape tests (#1243): Uncanny Metabolism (L2, full
 * Focus refill once/long rest + a bonusHeal descriptor) and Perfect Focus (L15,
 * every-combat top-up to 4). Pure — exercises the REAL monk.resourceFn
 * descriptors through applyInitiativeRegen (no DB, no dice rolled): the actual
 * HP heal (rolling the Martial Arts die + applying it) needs the impure
 * rollInitiative op and is covered by the DB-backed
 * routes/character/__tests__/resources-roll-initiative.test.ts instead.
 */

import { describe, it, expect } from "vitest";

import { monk } from "@/lib/classes/monk.js";
import {
  applyInitiativeRegen,
  clearInitiativeRegenMarkers,
  normalizeResourcesMutable,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import type { DerivedClassInfo } from "@/lib/classes/class-features.js";

const ABILITY_SCORES = { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 };

function focusInfo(level: number, profBonus: number): DerivedClassInfo {
  return { resources: monk.resourceFn!(level, ABILITY_SCORES, profBonus), features: [] };
}

function stateWithUsed(used: Record<string, number>): ResourcesMutableState {
  const state = normalizeResourcesMutable(null);
  state.used = { ...used };
  return state;
}

describe("Monk Focus onInitiative — Uncanny Metabolism / Perfect Focus (#1243)", () => {
  it("(d) below monk level 2: no Focus pool exists, so rollInitiative is inert", () => {
    const state = stateWithUsed({});
    const regen = applyInitiativeRegen(state, focusInfo(1, 2));
    expect(regen).toEqual([]);
    expect(state.used.focus).toBeUndefined();
  });

  it("(a) L2: regains all Focus once per long rest and surfaces a bonusHeal descriptor (monk level + Martial Arts die)", () => {
    const state = stateWithUsed({ focus: 2 }); // fully spent — total is 2 at level 2
    const regen = applyInitiativeRegen(state, focusInfo(2, 2));
    expect(state.used.focus).toBe(0);
    expect(regen).toEqual([
      {
        key: "focus", label: "Focus Points", restored: 2, remaining: 2,
        bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: 6, flatBonus: 2 },
      },
    ]);
  });

  it("(c) L2 (below 15): the once-per-rest refill does not repeat mid-rest, and there is no top-up descriptor yet", () => {
    const state = stateWithUsed({ focus: 2 });
    applyInitiativeRegen(state, focusInfo(2, 2)); // consumes the 1/long-rest use
    state.used.focus = 2; // spend it all again within the same rest cycle
    const regen = applyInitiativeRegen(state, focusInfo(2, 2));
    expect(state.used.focus).toBe(2); // untouched — no second combat-start descriptor below L15
    expect(regen).toEqual([]);

    clearInitiativeRegenMarkers(state); // simulates a long rest
    const afterRest = applyInitiativeRegen(state, focusInfo(2, 2));
    expect(state.used.focus).toBe(0); // fires again after a long rest
    expect(afterRest[0]?.bonusHeal?.dieFaces).toBe(6);
  });

  it("(b) L15: once Uncanny Metabolism has fired this rest, Perfect Focus tops Focus up to 4 when at 3 or fewer", () => {
    const state = stateWithUsed({ focus: 15 }); // fully spent — total is 15 at level 15
    applyInitiativeRegen(state, focusInfo(15, 5)); // Uncanny Metabolism: full refill, consumes the 1/rest use
    expect(state.used.focus).toBe(0);

    state.used.focus = 13; // 2 remaining — at/below Perfect Focus's floor of 4
    const regen = applyInitiativeRegen(state, focusInfo(15, 5));
    // Uncanny Metabolism already used this rest; only Perfect Focus fires.
    expect(state.used.focus).toBe(11); // topped up to 4 remaining (15 - 11)
    expect(regen).toEqual([{ key: "focus", label: "Focus Points", restored: 2, remaining: 4 }]);
  });

  it("L15 Perfect Focus does not fire when Focus is already above the 4-point floor", () => {
    const state = stateWithUsed({ focus: 15 });
    applyInitiativeRegen(state, focusInfo(15, 5)); // consumes the 1/long-rest use
    state.used.focus = 10; // 5 remaining — already above the floor of 4
    const regen = applyInitiativeRegen(state, focusInfo(15, 5));
    expect(state.used.focus).toBe(10); // unchanged
    expect(regen).toEqual([]);
  });
});
