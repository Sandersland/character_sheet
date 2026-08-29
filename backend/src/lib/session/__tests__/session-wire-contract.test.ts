// If CampaignRole gains a variant, SessionDoorwayRole must gain it too (#1273).

import { describe, expectTypeOf, it } from "vitest";

import type { CampaignRole } from "@/generated/prisma/client.js";
import type { SessionDoorwayRole } from "@character-sheet/shared-types";

describe("session wire contract", () => {
  it("keeps the doorway role in step with Prisma's CampaignRole", () => {
    expectTypeOf<CampaignRole>().toEqualTypeOf<SessionDoorwayRole>();
  });
});
