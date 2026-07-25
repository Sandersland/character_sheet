/**
 * Guards the @/types/character barrel's surface for the wire types that now live
 * in shared-types (#1273). Every migrated name must stay reachable from the
 * barrel: hundreds of call sites import from there, and a dropped re-export in a
 * types/character/*.ts module would otherwise only surface as scattered errors.
 * The import list below IS the assertion — tsc fails if a name stops resolving.
 */

import { describe, expectTypeOf, it } from "vitest";

import type * as Shared from "@character-sheet/shared-types";
import type {
  CampaignRecap,
  ParticipantSummary,
  SessionDoorwayKind,
  SessionDoorwaySessionState,
  SessionDoorwayState,
  SessionSummary,
  SessionSummaryAdvancement,
  SessionSummaryItem,
} from "@/types/character";

describe("@/types/character barrel", () => {
  it("re-exports the shared session wire types", () => {
    expectTypeOf<CampaignRecap>().toEqualTypeOf<Shared.CampaignRecap>();
    expectTypeOf<ParticipantSummary>().toEqualTypeOf<Shared.ParticipantSummary>();
    expectTypeOf<SessionDoorwayKind>().toEqualTypeOf<Shared.SessionDoorwayKind>();
    expectTypeOf<SessionDoorwaySessionState>().toEqualTypeOf<Shared.SessionDoorwaySessionState>();
    expectTypeOf<SessionDoorwayState>().toEqualTypeOf<Shared.SessionDoorwayState>();
    expectTypeOf<SessionSummary>().toEqualTypeOf<Shared.SessionSummary>();
    expectTypeOf<SessionSummaryAdvancement>().toEqualTypeOf<Shared.SessionSummaryAdvancement>();
    expectTypeOf<SessionSummaryItem>().toEqualTypeOf<Shared.SessionSummaryItem>();
  });
});
