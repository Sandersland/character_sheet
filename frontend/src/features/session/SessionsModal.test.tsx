import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionsModal from "@/features/session/SessionsModal";
import { fetchCampaignSessions } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { sessionKeys } from "@/api/queryKeys";
import type { CampaignRecap, Session } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaignSessions: vi.fn(),
  // Opening a recap from the list also needs SessionSummaryModal's own reads: useSessionRecapDetail + useCampaignEntities.
  fetchSession: vi.fn(),
  fetchEntities: vi.fn().mockResolvedValue([]),
}));

const mockFetch = vi.mocked(fetchCampaignSessions);

function makeSession(over: Partial<Session> & { id: string }): Session {
  return {
    campaignId: "camp-1",
    status: "ended",
    startedAt: "2026-07-01T00:00:00.000Z",
    title: null,
    ...over,
  } as Session;
}

const recap: CampaignRecap = {
  startedAt: "2026-06-22T18:00:00.000Z",
  endedAt: "2026-06-22T21:30:00.000Z",
  durationMs: 3.5 * 60 * 60 * 1000,
  participantCount: 2,
  xpGained: 450,
  levelsGained: 1,
  spellsCast: 3,
  combatRounds: 4,
  attackRolls: 5,
  damageRolls: 4,
  itemsAcquired: [],
  itemsSold: [],
  loot: [],
  slotsSpent: {},
  featsOrAsis: [],
  totalPresentMs: 6 * 60 * 60 * 1000,
};

describe("SessionsModal (#1299 review — session list onto sessionKeys)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders no fetch and an empty list for an uncampaigned character", async () => {
    render(<SessionsModal characterId="c1" onClose={vi.fn()} />);
    expect(await screen.findByText(/No sessions yet/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and renders a campaign's sessions, newest handled server-side", async () => {
    mockFetch.mockResolvedValue([
      makeSession({ id: "s1", title: "The Sunless Citadel" }),
      makeSession({ id: "s2", title: "The Sack of Greenest", status: "active" }),
    ]);
    render(<SessionsModal characterId="c1" campaignId="camp-1" onClose={vi.fn()} />);

    expect(await screen.findByText("The Sunless Citadel")).toBeInTheDocument();
    expect(screen.getByText("The Sack of Greenest")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("camp-1");
  });

  it("shows an error message when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    render(<SessionsModal characterId="c1" campaignId="camp-1" onClose={vi.fn()} />);

    expect(await screen.findByText("Couldn't load sessions — try again.")).toBeInTheDocument();
  });

  it("opens a session's recap when it has a summary", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue([
      // journalEntries: [] makes useSessionRecapDetail treat this as already seeded, skipping its own fetchSession call.
      makeSession({ id: "s1", title: "The Sunless Citadel", summary: recap, journalEntries: [] }),
    ]);
    render(<SessionsModal characterId="c1" campaignId="camp-1" onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /The Sunless Citadel/ }));
    expect(await screen.findByText("XP gained")).toBeInTheDocument();
  });

  // staleTime:0 means a cache-primed list still gets a confirming network call on every open.
  it("renders a cache-primed list instantly, then still refetches on open", async () => {
    getQueryClient().setQueryData(sessionKeys.campaignList("camp-1"), [
      makeSession({ id: "s1", title: "Cached Session" }),
    ]);
    mockFetch.mockResolvedValue([makeSession({ id: "s1", title: "Cached Session" })]);

    render(<SessionsModal characterId="c1" campaignId="camp-1" onClose={vi.fn()} />);

    expect(screen.getByText("Cached Session")).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("camp-1"));
  });

  // query-core sets status:'error' even when `data` is retained, so the error line must render alongside the last-known list, not instead of it.
  it("shows the error line alongside a cached list when a background refetch fails", async () => {
    getQueryClient().setQueryData(sessionKeys.campaignList("camp-1"), [
      makeSession({ id: "s1", title: "Cached Session" }),
    ]);
    mockFetch.mockRejectedValue(new Error("network down"));

    render(<SessionsModal characterId="c1" campaignId="camp-1" onClose={vi.fn()} />);

    expect(
      await screen.findByText("Couldn't load sessions — try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cached Session")).toBeInTheDocument();
  });
});
