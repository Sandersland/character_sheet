/**
 * ELEMENTAL_DAMAGE_TYPES used to define its own union; the tuple stays here (the
 * route's z.enum consumes it) while the union moved to shared-types (#1273), so
 * only the first assertion keeps the two in step.
 *
 * The union-completeness assertions are the guard for the drift that motivated
 * this move: the frontend's ResourceOperation copy was missing
 * ForgetSubclassChoiceOperation entirely — an op the server validates and audits
 * that no client could express. Spelling out every member means adding one to
 * the union without listing it here fails the build.
 */

import { describe, expectTypeOf, it } from "vitest";

import { ELEMENTAL_DAMAGE_TYPES } from "../warrior-of-elements.js";
import type {
  ElementalBurstResult,
  ElementalDamageType,
  ElementalStrikeResult,
  ForgetExpertiseOperation,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnExpertiseOperation,
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
      | LearnExpertiseOperation
      | ForgetExpertiseOperation
    >();
  });

  it("keeps the elements result a two-member union, not an optional bag (#1686: the toggle result retired — it's a plain ExecuteActionResult now, not a WarriorOfElementsResult)", () => {
    expectTypeOf<WarriorOfElementsResult>().toEqualTypeOf<
      ElementalBurstResult | ElementalStrikeResult
    >();
  });
});
