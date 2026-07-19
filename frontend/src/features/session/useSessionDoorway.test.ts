import { describe, expect, it, vi, beforeEach } from "vitest";

import { dispatchDoorwayAction } from "@/features/session/useSessionDoorway";
import { joinSession, startCampaignSession, startSoloSession } from "@/api/client";

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  joinSession: vi.fn(),
  startCampaignSession: vi.fn(),
  startSoloSession: vi.fn(),
}));

const mockJoin = vi.mocked(joinSession);
const mockStart = vi.mocked(startCampaignSession);
const mockStartSolo = vi.mocked(startSoloSession);

describe("dispatchDoorwayAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins with the session id", async () => {
    await dispatchDoorwayAction("join", "camp1", "s1", "c1");
    expect(mockJoin).toHaveBeenCalledWith("camp1", "s1", "c1");
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("starts a session (no session id needed)", async () => {
    await dispatchDoorwayAction("start", "camp1", undefined, "c1");
    expect(mockStart).toHaveBeenCalledWith("camp1", "c1");
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it("starts a SOLO session (null campaignId) via startSoloSession, not the campaign start", async () => {
    await dispatchDoorwayAction("start", null, undefined, "c1");
    expect(mockStartSolo).toHaveBeenCalledWith("c1");
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("throws on join with a null campaignId — joining is campaign-only (fail loud)", async () => {
    await expect(dispatchDoorwayAction("join", null, "s1", "c1")).rejects.toThrow(/campaign/i);
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it("throws on join without a session id instead of skipping the call", async () => {
    await expect(dispatchDoorwayAction("join", "camp1", undefined, "c1")).rejects.toThrow(
      /session id/i,
    );
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it("resume makes no network call (already joined)", async () => {
    await dispatchDoorwayAction("resume", "camp1", "s1", "c1");
    expect(mockJoin).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
