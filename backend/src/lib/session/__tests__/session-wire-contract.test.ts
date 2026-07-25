/**
 * The doorway's `role` used to BE Prisma's CampaignRole; moving the shape into
 * shared-types decoupled them, because that package cannot depend on Prisma
 * (#1273). Without this assertion a schema migration adding a third role would
 * leave the wire type silently lying about what the endpoint can return.
 */

import { describe, expectTypeOf, it } from "vitest";

import type { CampaignRole } from "@/generated/prisma/client.js";
import type { SessionDoorwayRole } from "@character-sheet/shared-types";

describe("session wire contract", () => {
  it("keeps the doorway role in step with Prisma's CampaignRole", () => {
    expectTypeOf<CampaignRole>().toEqualTypeOf<SessionDoorwayRole>();
  });
});
