// Route/wire-level proof for the announce-augmentor migration (#1910): exercises
// the REAL buildAvailableActionsView (serialize/classes.ts) — the function
// GET /api/characters/:id's availableActions[] is built from — with hand-built
// classEntries (no DB round trip needed; featureRowsOf, the real production
// extractor, reads `.class.features`/`.subclassRef.features` off whatever
// shape it's given). Pins the exact AC scenarios from #1910: a 2024 monk at
// L3/L12/L13 (Deflect Attacks clause + specs), a 2014 monk L3+ (Deflect
// Missiles specs), and a 2014 vs 2024 Eldritch Knight L15 (Arcane Charge
// reminder present only in 2014) — byte-identical to deriveDeflectSpec's own
// resolved values, proving the served wire value and the pure rule function
// never drift.
import { describe, expect, it } from "vitest";

import { buildAvailableActionsView } from "../classes.js";
import { FIGHTER_BASE_ROWS, MONK_BASE_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";
import { deriveDeflectSpec } from "@/lib/srd/deflect.js";
import { abilityModifier } from "@/lib/srd/srd.js";
import { ARCANE_CHARGE_REMINDER } from "@/lib/classes/arcane-charge.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

const SCORES = { strength: 10, dexterity: 16, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
const DEX_MOD = abilityModifier(SCORES.dexterity);

// Deflect Attacks/Missiles moved off DERIVED_ACTIONS onto ClassFeature rows
// (#1912) — `class: { features: [] }` no longer surfaces them at all, so
// this fixture needs MONK_BASE_ROWS' real content (test-feature-rows
// .fixture.ts, kept in parity with the seed by literal-fixture-parity.test.ts).
function monkEntries(level: number): CharacterWithRelations["classEntries"] {
  return [
    { name: "monk", subclass: undefined, level, class: { features: MONK_BASE_ROWS }, subclassRef: undefined },
  ] as unknown as CharacterWithRelations["classEntries"];
}

function eldritchKnightEntries(level: number): CharacterWithRelations["classEntries"] {
  return [
    {
      name: "fighter",
      subclass: "eldritch knight",
      level,
      class: { features: FIGHTER_BASE_ROWS },
      subclassRef: undefined,
    },
  ] as unknown as CharacterWithRelations["classEntries"];
}

describe("buildAvailableActionsView — Deflect Attacks / Deflect Missiles (#1910)", () => {
  it("2024 monk L3: deflectAttacks/deflectAttacksRedirect carry deriveDeflectSpec's exact resolved dice + the B/P/S clause", () => {
    const actions = buildAvailableActionsView(monkEntries(3), 3, undefined, true, "EDITION_2024", SCORES, [], 0);
    const expected = deriveDeflectSpec(3, DEX_MOD, "EDITION_2024");
    const base = actions.find((a) => a.key === "deflectAttacks");
    expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
    expect(base?.damageTypeClause).toBe("bludgeoning, piercing, or slashing damage");
    const redirect = actions.find((a) => a.key === "deflectAttacksRedirect");
    expect(redirect?.effect).toEqual({ effectType: "damage", dice: expected.redirect, scaling: { mode: "none" } });
  });

  it("2024 monk L12: dice scale with monk level, clause still B/P/S", () => {
    const actions = buildAvailableActionsView(monkEntries(12), 12, undefined, true, "EDITION_2024", SCORES, [], 0);
    const expected = deriveDeflectSpec(12, DEX_MOD, "EDITION_2024");
    const base = actions.find((a) => a.key === "deflectAttacks");
    expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
    expect(base?.damageTypeClause).toBe("bludgeoning, piercing, or slashing damage");
  });

  it("2024 monk L13: clause widens to 'any damage type' (Deflect Energy)", () => {
    const actions = buildAvailableActionsView(monkEntries(13), 13, undefined, true, "EDITION_2024", SCORES, [], 0);
    const expected = deriveDeflectSpec(13, DEX_MOD, "EDITION_2024");
    const base = actions.find((a) => a.key === "deflectAttacks");
    expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
    expect(base?.damageTypeClause).toBe("any damage type");
  });

  it("2014 monk L3+: deflectMissiles/deflectMissilesThrow carry deriveDeflectSpec's exact resolved dice, no damage-type clause", () => {
    const actions = buildAvailableActionsView(monkEntries(5), 5, undefined, true, "EDITION_2014", SCORES, [], 0);
    const expected = deriveDeflectSpec(5, DEX_MOD, "EDITION_2014");
    const base = actions.find((a) => a.key === "deflectMissiles");
    expect(base?.effect).toEqual({ effectType: "utility", dice: expected.reduction, scaling: { mode: "none" } });
    expect(base?.damageTypeClause).toBeUndefined();
    const throwBack = actions.find((a) => a.key === "deflectMissilesThrow");
    expect(throwBack?.effect).toEqual({ effectType: "damage", dice: expected.redirect, scaling: { mode: "none" } });
  });
});

describe("buildAvailableActionsView — Arcane Charge reminder on Action Surge (#1852, #1910)", () => {
  it("2014 Eldritch Knight L15 sees the Arcane Charge reminder end-to-end through buildAvailableActionsView", () => {
    const actions = buildAvailableActionsView(eldritchKnightEntries(15), 15, undefined, true, "EDITION_2014", SCORES, [], 0);
    const card = actions.find((a) => a.key === "actionSurge");
    expect(card).toBeDefined();
    expect(card?.reminder).toContain(ARCANE_CHARGE_REMINDER);
  });

  it("2024 Eldritch Knight L15 sees no Arcane Charge reminder", () => {
    const actions = buildAvailableActionsView(eldritchKnightEntries(15), 15, undefined, true, "EDITION_2024", SCORES, [], 0);
    const card = actions.find((a) => a.key === "actionSurge");
    expect(card).toBeDefined();
    expect(card?.reminder ?? "").not.toContain("Arcane Charge");
  });
});
