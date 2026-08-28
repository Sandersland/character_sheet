// The actual HP heal needs the impure rollInitiative op, covered by the DB-backed resources-roll-initiative suite.
import { describe, it, expect } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import {
  applyInitiativeRegen,
  clearInitiativeRegenMarkers,
  normalizeResourcesMutable,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import type { DerivedClassInfo } from "@/lib/classes/class-features.js";

import { MONK_BASE_ROWS } from "./test-feature-rows.fixture.js";

const ABILITY_SCORES = { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 };

function baseRow(name: string, edition: "EDITION_2014" | "EDITION_2024") {
  const row = MONK_BASE_ROWS.find((r) => r.name === name && r.edition === edition);
  if (!row) throw new Error(`fixture missing monk row ${name}/${edition}`);
  return row;
}

const KI_ROW = baseRow("Ki", "EDITION_2014");
const FOCUS_ROW = baseRow("Focus", "EDITION_2024");

function focusInfo(level: number, profBonus: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024"): DerivedClassInfo {
  const row = edition === "EDITION_2014" ? KI_ROW : FOCUS_ROW;
  return { resources: poolsFromRows([row], level, ABILITY_SCORES, profBonus, edition), features: [] };
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

  // SRD 5.1 / PHB'14 p.78.
  it("(EDITION_2014) L2: no onInitiative descriptor at all — 2014 Ki has no Uncanny Metabolism analog", () => {
    const state = stateWithUsed({ ki: 2 });
    const regen = applyInitiativeRegen(state, focusInfo(2, 2, "EDITION_2014"));
    expect(regen).toEqual([]);
    expect(state.used.ki).toBe(2); // untouched
  });

  // SRD 5.1 / PHB'14 p.79 — threshold:0, unlike 2024 Perfect Focus's "3 or fewer" trigger.
  it("(EDITION_2014) L20: Perfect Self is a no-op with 1+ ki remaining, and regains 4 when at 0", () => {
    const state = stateWithUsed({ ki: 19 }); // 1 remaining — above the threshold of 0
    const noop = applyInitiativeRegen(state, focusInfo(20, 6, "EDITION_2014"));
    expect(noop).toEqual([]);
    expect(state.used.ki).toBe(19);

    state.used.ki = 20; // 0 remaining
    const regen = applyInitiativeRegen(state, focusInfo(20, 6, "EDITION_2014"));
    expect(state.used.ki).toBe(16); // topped up to 4 remaining (20 - 16)
    expect(regen).toEqual([{ key: "ki", label: "Ki Points", restored: 4, remaining: 4 }]);
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
