/**
 * Twin of shared-types-barrel.test.ts, scoped to @character-sheet/contracts
 * (#1370). Guards the @/types/character barrel's re-export of the names
 * derived from route zod schemas: every migrated name must stay reachable
 * from the barrel, and the import list below IS the assertion — tsc fails if
 * a name stops resolving. Only names with a real frontend call site are
 * re-exported (see classes.ts's why-comment); CastManeuverOperation,
 * ActivateCloakOfShadowsOperation, and the Hand of Harm / Hand of Ultimate
 * Mercy op types are deliberately absent from both (no frontend consumer).
 */

import { describe, expectTypeOf, it } from "vitest";

import type * as Contracts from "@character-sheet/contracts";
import type {
  AttemptStunningStrikeOperation,
  CastChannelDivinityOperation,
  CastShadowArtOperation,
  ChannelDivinityOperation,
  ImposeOpenHandRiderOperation,
  ManeuverOperation,
  OpenHandRider,
  SetQuiveringPalmOperation,
  ShadowArtOperation,
  TriggerQuiveringPalmOperation,
} from "@/types/character";

describe("@/types/character barrel — contracts re-exports", () => {
  it("re-exports the ability-op wire types derived from route zod schemas", () => {
    expectTypeOf<CastChannelDivinityOperation>().toEqualTypeOf<Contracts.CastChannelDivinityOperation>();
    expectTypeOf<ChannelDivinityOperation>().toEqualTypeOf<Contracts.ChannelDivinityOperation>();
    expectTypeOf<CastShadowArtOperation>().toEqualTypeOf<Contracts.CastShadowArtOperation>();
    expectTypeOf<ShadowArtOperation>().toEqualTypeOf<Contracts.ShadowArtOperation>();
    expectTypeOf<ManeuverOperation>().toEqualTypeOf<Contracts.ManeuverOperation>();
    expectTypeOf<AttemptStunningStrikeOperation>().toEqualTypeOf<Contracts.AttemptStunningStrikeOperation>();
    expectTypeOf<ImposeOpenHandRiderOperation>().toEqualTypeOf<Contracts.ImposeOpenHandRiderOperation>();
    expectTypeOf<OpenHandRider>().toEqualTypeOf<Contracts.OpenHandRider>();
    expectTypeOf<SetQuiveringPalmOperation>().toEqualTypeOf<Contracts.SetQuiveringPalmOperation>();
    expectTypeOf<TriggerQuiveringPalmOperation>().toEqualTypeOf<Contracts.TriggerQuiveringPalmOperation>();
  });
});
