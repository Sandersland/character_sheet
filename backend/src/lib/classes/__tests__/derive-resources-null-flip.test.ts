// #1524's "Watch for: the deriveResources null-flip" — with an absent
// featureRows carrier (every narrow-select caller reaching deriveResources
// through deriveEntryScopedResources: MANEUVER_SELECT, FOCUS_CAST_CHARACTER_SELECT,
// SPELLCASTING_SELECT, rest.ts's HpOpContext, level-reconciliation.ts's three
// selects, channel-divinity.ts), `features` is always empty. A class/subclass
// whose only content used to come from TS-array features (no resourceFn pools)
// now trips deriveResources' `resources.length === 0 && features.length === 0`
// guard and returns null where it used to return a valid info object — DROPPING
// any subclass deriveExtras/choices contribution, since those were computed
// AFTER that guard in the original #1524 scope. Ranger/Hunter is the real,
// live example: Ranger has no resourceFn at all, so at level 7 (Hunter's Prey +
// Defensive Tactics both granted) the ENTIRE contribution used to be features +
// subclassChoices — with no carrier, features is empty, and pre-fix this
// function returned null, silently losing subclassChoices too.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const ABILITY_SCORES = {
  strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10,
};

describe("deriveResources computes subclass extras/choices BEFORE the null check (#1524 null-flip fix)", () => {
  it("Ranger/Hunter L7 with NO featureRows carrier still derives subclassChoices — the real regression this fix closes", () => {
    const info = deriveResources("ranger", "hunter", 7, ABILITY_SCORES, proficiencyBonusForLevel(7), undefined, "EDITION_2024");
    expect(info).not.toBeNull();
    const keys = (info?.subclassChoices ?? []).map((c) => c.key).sort();
    expect(keys).toEqual(["defensiveTactics", "huntersPrey"]);
    // features is legitimately empty here — no carrier was supplied — proving
    // this isn't a false pass from features smuggling content back in.
    expect(info?.features).toEqual([]);
  });

  it("a genuinely empty class (unknown name, no subclass, no carrier) still returns null — the guard isn't disabled, just reordered", () => {
    const info = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(info).toBeNull();
  });
});

// resolveArcaneRecoveryContext (lib/spellcasting/spellcasting.ts) and
// loadResourcesReconcileState (lib/leveling/level-reconciliation.ts) are both
// module-private, so their exact expressions are re-asserted here directly
// rather than imported:
//   resolveArcaneRecoveryContext: `Boolean(resourceInfo?.resources.some(...))`
//   reconcileManeuvers/reconcileToolProficiencies (loadResourcesReconcileState's
//     two callers): `derived?.maneuverChoiceCount ?? 0` / `derived?.toolProfChoiceCount ?? 0`
// Both are optional-chained/defaulted, so a null `derived`/`resourceInfo` is
// UNCONDITIONALLY safe by construction — verified here on the null value
// itself, since the private functions can't be imported directly. The
// end-to-end proof that loadResourcesReconcileState's real callers survive a
// null-flip case lives in subclass-choices.test.ts's "level-down
// reconciliation" describe block (Ranger/Hunter, the same live example above),
// which exercises the actual private function through its real reconcilers.
describe("the exact null-safe expressions resolveArcaneRecoveryContext / loadResourcesReconcileState's callers use", () => {
  it("Boolean(nullDerived?.resources.some(...)) is false, never throws", () => {
    const nullDerived = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(() => Boolean(nullDerived?.resources.some((r) => r.key === "arcaneRecovery"))).not.toThrow();
    expect(Boolean(nullDerived?.resources.some((r) => r.key === "arcaneRecovery"))).toBe(false);
  });

  it("nullDerived?.maneuverChoiceCount ?? 0 / ?.toolProfChoiceCount ?? 0 are both 0, never throw", () => {
    const nullDerived = deriveResources("not-a-class", undefined, 5, ABILITY_SCORES, 3, undefined, "EDITION_2024");
    expect(nullDerived?.maneuverChoiceCount ?? 0).toBe(0);
    expect(nullDerived?.toolProfChoiceCount ?? 0).toBe(0);
  });
});
