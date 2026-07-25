/**
 * Latches the class-resource wire types (#1273) against the backend facts they
 * were declared beside. ELEMENTAL_DAMAGE_TYPES used to define its own union;
 * the tuple stays backend-side (it feeds the route's z.enum) so only this
 * assertion keeps the two in step now.
 *
 * ResourceOperation is asserted member-by-member because the frontend's copy was
 * missing ForgetSubclassChoiceOperation entirely — an op the server validates
 * and audits but no client could express (#1273 drift 3a).
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import { ELEMENTAL_DAMAGE_TYPES, resolveElementalBurstDamage } from "../warrior-of-elements.js";
import type {
  ElementalDamageType,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOperation,
  RestoreResourceOperation,
  RollInitiativeOperation,
  SpendResourceOperation,
  WarriorOfElementsResult,
} from "@character-sheet/shared-types";

describe("class-resource wire contract", () => {
  it("keeps ELEMENTAL_DAMAGE_TYPES in step with its shared union", () => {
    expectTypeOf<(typeof ELEMENTAL_DAMAGE_TYPES)[number]>().toEqualTypeOf<ElementalDamageType>();
    expect(true).toBe(true);
  });

  it("carries every resource op the dispatcher accepts", () => {
    expectTypeOf<ResourceOperation>().toEqualTypeOf<
      | SpendResourceOperation
      | RestoreResourceOperation
      | RollInitiativeOperation
      | LearnManeuverOperation
      | ForgetManeuverOperation
      | LearnToolProficiencyOperation
      | ForgetToolProficiencyOperation
      | LearnSubclassChoiceOperation
      | ForgetSubclassChoiceOperation
    >();
    expect(true).toBe(true);
  });

  it("resolves an elemental burst into a narrowable result member", () => {
    const { outcome, appliedDamage } = resolveElementalBurstDamage(9, 14, 15);
    const result: WarriorOfElementsResult = {
      dc: 14,
      saveRoll: 9,
      outcome,
      damageType: "fire",
      rawDamage: 15,
      appliedDamage,
      summary: "Elemental Burst",
    };
    // The union discriminates structurally: only ElementalBurstResult has rawDamage.
    expect("rawDamage" in result && result.rawDamage).toBe(15);
    expect(appliedDamage).toBe(15);
  });
});
