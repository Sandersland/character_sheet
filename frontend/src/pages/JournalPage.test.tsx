import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import JournalPage from "@/pages/JournalPage";
import * as client from "@/api/client";
import { __resetCampaignEntitiesCacheForTests } from "@/hooks/useCampaignEntities";
import type { CampaignArc, Character, ChronicleSession, JournalEntry } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCharacter: vi.fn(),
  fetchCampaignArcs: vi.fn().mockResolvedValue([]),
  fetchChronicleSessions: vi.fn().mockResolvedValue([]),
  fetchEntities: vi.fn().mockResolvedValue([]),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
  updateSessionTitle: vi.fn(),
}));

// Force the desktop layout (spine + manuscript render together) — the default
// setup stub reports matches:false, which useIsBelowMd reads as mobile.
function forceDesktop() {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function entry(over: Partial<JournalEntry> & { id: string }): JournalEntry {
  return {
    kind: "ENTRY",
    date: "2026-07-12T00:00:00.000Z",
    loggedAt: "2026-07-12T21:52:00.000Z",
    body: "an entry",
    visibility: "CAMPAIGN",
    ...over,
  };
}

function session(over: Partial<ChronicleSession> & { id: string; sessionNumber: number }): ChronicleSession {
  return {
    campaignId: "camp-1",
    status: "ended",
    startedAt: `2026-07-${String(over.sessionNumber + 9).padStart(2, "0")}T00:00:00.000Z`,
    title: null,
    arcId: null,
    noteCount: 0,
    participants: [{ id: "p1", sessionId: over.id, characterId: "char-1", joinedAt: "" }],
    ...over,
  };
}

function makeCharacter(over: Partial<Character>): Character {
  return {
    id: "char-1",
    name: "Gierr of the Vale",
    campaignId: "camp-1",
    journal: [],
    ...over,
  } as unknown as Character;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/char-1/journal"]}>
      <Routes>
        <Route path="/characters/:id/journal" element={<JournalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCampaignEntitiesCacheForTests();
  forceDesktop();
  vi.mocked(client.fetchCampaignArcs).mockResolvedValue([]);
  vi.mocked(client.fetchChronicleSessions).mockResolvedValue([]);
  vi.mocked(client.fetchEntities).mockResolvedValue([]);
});

describe("JournalPage", () => {
  it("renders part headers for a campaign character with arcs, newest chapter selected", async () => {
    const arcs: CampaignArc[] = [
      { id: "a1", campaignId: "camp-1", name: "Opening Moves", position: 0, createdAt: "" },
      { id: "a2", campaignId: "camp-1", name: "The Sunken Crypt", position: 1, createdAt: "" },
    ];
    vi.mocked(client.fetchCampaignArcs).mockResolvedValue(arcs);
    vi.mocked(client.fetchChronicleSessions).mockResolvedValue([
      session({ id: "s2", sessionNumber: 2, arcId: "a2", title: "The Vault Below" }),
      session({ id: "s1", sessionNumber: 1, arcId: "a1", title: "Leaving Neverwinter" }),
    ]);
    vi.mocked(client.fetchCharacter).mockResolvedValue(
      makeCharacter({ journal: [entry({ id: "e2", sessionId: "s2", body: "We found the vault." })] }),
    );

    renderPage();

    expect(await screen.findByText("Part II — The Sunken Crypt")).toBeInTheDocument();
    expect(screen.getByText("Part I — Opening Moves")).toBeInTheDocument();
    // Newest session is the default selection → its heading + prose show.
    expect(screen.getByRole("heading", { name: "The Vault Below" })).toBeInTheDocument();
    expect(screen.getByText("We found the vault.")).toBeInTheDocument();
  });

  it("renders a flat chapter list with no part headers when there are no arcs", async () => {
    vi.mocked(client.fetchChronicleSessions).mockResolvedValue([
      session({ id: "s1", sessionNumber: 1, title: "The Sack of Greenest" }),
    ]);
    vi.mocked(client.fetchCharacter).mockResolvedValue(
      makeCharacter({ journal: [entry({ id: "e1", sessionId: "s1", body: "Greenest burns." })] }),
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "The Sack of Greenest" })).toBeInTheDocument();
    expect(screen.queryByText(/^Part /)).not.toBeInTheDocument();
    expect(screen.getByText("Greenest burns.")).toBeInTheDocument();
  });

  it("renders a flat between-sessions chronicle for a campaign-less character", async () => {
    vi.mocked(client.fetchCharacter).mockResolvedValue(
      makeCharacter({
        campaignId: undefined,
        journal: [entry({ id: "e1", sessionId: undefined, kind: "NOTE", body: "A solo musing.", visibility: "PRIVATE" })],
      }),
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "Between sessions" })).toBeInTheDocument();
    expect(client.fetchChronicleSessions).not.toHaveBeenCalled();
    expect(screen.getByText("A solo musing.")).toBeInTheDocument();
  });

  it("lets a participant rename the chapter title in place", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchChronicleSessions).mockResolvedValue([
      session({ id: "s1", sessionNumber: 1, title: "Old Name" }),
    ]);
    vi.mocked(client.fetchCharacter).mockResolvedValue(
      makeCharacter({ journal: [entry({ id: "e1", sessionId: "s1" })] }),
    );
    vi.mocked(client.updateSessionTitle).mockResolvedValue({} as never);

    renderPage();

    const heading = await screen.findByRole("heading", { name: "Old Name" });
    const header = heading.closest("header")!;
    await user.click(within(header).getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Chapter title" });
    await user.clear(input);
    await user.type(input, "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(client.updateSessionTitle).toHaveBeenCalledWith("camp-1", "s1", "New Name"),
    );
    expect(await screen.findByRole("heading", { name: "New Name" })).toBeInTheDocument();
  });
});
