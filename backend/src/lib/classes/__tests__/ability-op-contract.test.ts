/**
 * Latch for the ABILITY_REGISTRY op schemas migrated into
 * @character-sheet/contracts (#1370). Two things this guards:
 *
 * 1. z.infer aliases z.output, but the frontend must construct z.input — they
 *    diverge on `.transform()`/`.default()`/`.catch()`/`z.coerce.*`/`.pipe()`.
 *    None of the schemas below use any of those (verified by grep across
 *    backend/src at migration time), so z.input === z.output === z.infer for
 *    all of them. This test is the mechanical version of that grep: a future
 *    `.default()` added to one of these schemas changes z.input without
 *    changing z.infer, and this assertion goes red instead of quietly
 *    shipping the client a type it can no longer actually construct.
 * 2. Union completeness for ShadowArtOperation, the same drift shape that
 *    motivated resource-wire-contract.test.ts.
 */
import { describe, expectTypeOf, it } from "vitest";

import {
  activateCloakOfShadowsOpSchema,
  attemptStunningStrikeOpSchema,
  castChannelDivinityOpSchema,
  castManeuverOpSchema,
  castShadowArtOpSchema,
  dealHandOfHarmOpSchema,
  imposeOpenHandRiderOpSchema,
  setQuiveringPalmOpSchema,
  triggerQuiveringPalmOpSchema,
  useHandOfUltimateMercyOpSchema,
  type ActivateCloakOfShadowsOperation,
  type CastShadowArtOperation,
  type ShadowArtOperation,
} from "@character-sheet/contracts";
import type { z } from "zod";

describe("ability-op wire contract", () => {
  it("keeps every migrated op's client-constructible input identical to its inferred type", () => {
    expectTypeOf<z.input<typeof castChannelDivinityOpSchema>>().toEqualTypeOf<
      z.output<typeof castChannelDivinityOpSchema>
    >();
    expectTypeOf<z.input<typeof castManeuverOpSchema>>().toEqualTypeOf<z.output<typeof castManeuverOpSchema>>();
    expectTypeOf<z.input<typeof castShadowArtOpSchema>>().toEqualTypeOf<z.output<typeof castShadowArtOpSchema>>();
    expectTypeOf<z.input<typeof activateCloakOfShadowsOpSchema>>().toEqualTypeOf<
      z.output<typeof activateCloakOfShadowsOpSchema>
    >();
    expectTypeOf<z.input<typeof attemptStunningStrikeOpSchema>>().toEqualTypeOf<
      z.output<typeof attemptStunningStrikeOpSchema>
    >();
    expectTypeOf<z.input<typeof imposeOpenHandRiderOpSchema>>().toEqualTypeOf<
      z.output<typeof imposeOpenHandRiderOpSchema>
    >();
    expectTypeOf<z.input<typeof setQuiveringPalmOpSchema>>().toEqualTypeOf<
      z.output<typeof setQuiveringPalmOpSchema>
    >();
    expectTypeOf<z.input<typeof triggerQuiveringPalmOpSchema>>().toEqualTypeOf<
      z.output<typeof triggerQuiveringPalmOpSchema>
    >();
    expectTypeOf<z.input<typeof dealHandOfHarmOpSchema>>().toEqualTypeOf<z.output<typeof dealHandOfHarmOpSchema>>();
    expectTypeOf<z.input<typeof useHandOfUltimateMercyOpSchema>>().toEqualTypeOf<
      z.output<typeof useHandOfUltimateMercyOpSchema>
    >();
  });

  it("carries every Shadow Arts op the dispatcher accepts", () => {
    expectTypeOf<ShadowArtOperation>().toEqualTypeOf<CastShadowArtOperation | ActivateCloakOfShadowsOperation>();
  });
});
