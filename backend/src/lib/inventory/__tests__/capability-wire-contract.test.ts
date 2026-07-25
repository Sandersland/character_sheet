/**
 * Each union below used to be `(typeof TUPLE)[number]`, so the route's zod schema
 * and the wire type could not drift. Moving the unions to shared-types (#1273)
 * left the tuples behind as separate declarations — these assertions are what
 * now fails when a value is added to one side only.
 */

import { describe, expectTypeOf, it } from "vitest";

import {
  ADVANTAGE_ON,
  ATTUNEMENT_PREREQ_KINDS,
  CAPABILITY_OPS,
  CAPABILITY_TARGETS,
  CAST_RESOURCES,
  CAST_STAT_MODES,
  CHARGE_TRIGGERS,
  GRANT_TYPES,
  GRANT_VALUE_KINDS,
  PROFICIENCY_KINDS,
} from "../capabilities.js";
import type {
  AdvantageOn,
  AttunementPrereqKind,
  CapabilityOp,
  CapabilityTarget,
  CastResource,
  CastStatMode,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ProficiencyKind,
} from "@character-sheet/shared-types";

describe("capability wire contract", () => {
  it("keeps every as-const tuple in step with its shared union", () => {
    expectTypeOf<(typeof CAPABILITY_TARGETS)[number]>().toEqualTypeOf<CapabilityTarget>();
    expectTypeOf<(typeof CAPABILITY_OPS)[number]>().toEqualTypeOf<CapabilityOp>();
    expectTypeOf<(typeof ATTUNEMENT_PREREQ_KINDS)[number]>().toEqualTypeOf<AttunementPrereqKind>();
    expectTypeOf<(typeof CAST_RESOURCES)[number]>().toEqualTypeOf<CastResource>();
    expectTypeOf<(typeof CAST_STAT_MODES)[number]>().toEqualTypeOf<CastStatMode>();
    expectTypeOf<(typeof CHARGE_TRIGGERS)[number]>().toEqualTypeOf<ChargeTrigger>();
    expectTypeOf<(typeof GRANT_TYPES)[number]>().toEqualTypeOf<GrantType>();
    expectTypeOf<(typeof ADVANTAGE_ON)[number]>().toEqualTypeOf<AdvantageOn>();
    expectTypeOf<(typeof GRANT_VALUE_KINDS)[number]>().toEqualTypeOf<GrantValueKind>();
    expectTypeOf<(typeof PROFICIENCY_KINDS)[number]>().toEqualTypeOf<ProficiencyKind>();
  });
});
