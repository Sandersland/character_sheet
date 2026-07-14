import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import JournalDoorway from "@/features/journal/JournalDoorway";
import * as client from "@/api/client";
import type { Character, ChronicleSession, JournalEntry } from "@/types/character";

// useChronicle fetches arcs + sessions; stub both. Campaign-less characters skip
// the calls entirely, so the sessions mock only matters for campaign fixtures.
vi.mock("@/api/client", () => ({
  fetchCampaignArcs: vi.fn().mockResolvedValue([]),
  fetchChronicleSessions: vi.fn().mockResolvedValue([]),
}));

const ENTRY: JournalEntry = {
  id: "e1",
  kind: "NOTE",
  date: "2026-06-20T00:00:00.000Z",
  loggedAt: "2026-06-20T12:00:00.000Z",
  body: "Found three waterlogged tomes.",
  visibility: "PRIVATE",
};

function makeCharacter(journal: JournalEntry[], campaignId?: string): Character {
  return { id: "char-1", campaignId, journal } as unknown as Character;
}

function session(overrides: Partial<ChronicleSession>): ChronicleSession {
  return {
    id: "s1",
    campaignId: "camp-1",
    status: "COMPLETED",
    startedAt: "2026-06-20T00:00:00.000Z",
    sessionNumber: 1,
    noteCount: 0,
    ...overrides,
  } as ChronicleSession;
}

function renderDoorway(character: Character) {
  return render(
    <MemoryRouter>
      <JournalDoorway character={character} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchCampaignArcs).mockResolvedValue([]);
  vi.mocked(client.fetchChronicleSessions).mockResolvedValue([]);
});

describe("JournalDoorway", () => {
  it("links to the character's journal page", () => {
    renderDoorway(makeCharacter([ENTRY]));
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/characters/char-1/journal");
  });

  it("shows the empty state for a character with no entries", () => {
    renderDoorway(makeCharacter([]));
    expect(screen.getByText("Begin your chronicle")).toBeInTheDocument();
    expect(screen.getByText(/opens the book/i)).toBeInTheDocument();
  });

  it("shows note counts for a campaign-less character", () => {
    renderDoorway(makeCharacter([ENTRY, { ...ENTRY, id: "e2" }]));
    // 2 notes, no chapters (no sessions), with a last-written stamp.
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
    expect(screen.queryByText(/chapter/)).not.toBeInTheDocument();
  });

  it("shows the current chapter title and counts from the chronicle", async () => {
    vi.mocked(client.fetchChronicleSessions).mockResolvedValue([
      session({ id: "s2", sessionNumber: 2, title: "The Sunken Vault" }),
      session({ id: "s1", sessionNumber: 1, title: "Into the Mist" }),
    ]);

    renderDoorway(makeCharacter([ENTRY], "camp-1"));

    expect(await screen.findByText("The Sunken Vault")).toBeInTheDocument();
    expect(screen.getByText(/2 chapters/)).toBeInTheDocument();
  });

  it('falls back to "Session N" for an untitled current session', async () => {
    vi.mocked(client.fetchChronicleSessions).mockResolvedValue([
      session({ id: "s3", sessionNumber: 3, title: null }),
    ]);

    renderDoorway(makeCharacter([ENTRY], "camp-1"));

    await waitFor(() => expect(screen.getByText("Session 3")).toBeInTheDocument());
    expect(screen.getByText(/1 chapter\b/)).toBeInTheDocument();
  });
});
