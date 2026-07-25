/**
 * Latches the session wire types (#1273) that moved to shared-types against the
 * backend-only facts they used to be declared next to. The migration decoupled
 * SessionDoorwayState.role from Prisma's CampaignRole (the package cannot depend
 * on Prisma), so a schema migration adding a third role would silently make the
 * wire type lie — the assertion below is what catches that.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import type { CampaignRole } from "@/generated/prisma/client.js";
import { computeCampaignRecap, computeSessionSummary } from "../session-summary.js";
import type {
  CampaignRecap,
  ParticipantSummary,
  SessionDoorwayRole,
  SessionSummary,
} from "@character-sheet/shared-types";

describe("session wire contract", () => {
  it("keeps the doorway role in step with Prisma's CampaignRole", () => {
    expectTypeOf<CampaignRole>().toEqualTypeOf<SessionDoorwayRole>();
    expect(true).toBe(true);
  });

  it("computes summaries typed by the shared declarations", () => {
    const summary = computeSessionSummary([], {
      startedAt: new Date("2026-01-01T00:00:00Z"),
      endedAt: new Date("2026-01-01T01:00:00Z"),
    });
    expectTypeOf(summary).toEqualTypeOf<SessionSummary>();

    const participant: ParticipantSummary = {
      ...summary,
      characterId: "c1",
      characterName: "Ilya",
      joinedAt: summary.startedAt,
      leftAt: null,
      presentMs: summary.durationMs,
    };
    expectTypeOf(computeCampaignRecap([participant])).toEqualTypeOf<CampaignRecap>();
    expect(computeCampaignRecap([participant]).participantCount).toBe(1);
  });
});
