import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import { applyExperienceOperations, fetchSession } from "@/api/client";
import type { Character, Session, SessionSummary } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyExperienceOperations: vi.fn(),
  fetchSession: vi.fn(),
}));

const mockApplyXp = vi.mocked(applyExperienceOperations);
const mockFetchSession = vi.mocked(fetchSession);

beforeEach(() => {
  vi.clearAllMocks();
});

const summary: SessionSummary = {
  startedAt: "2026-06-22T18:00:00.000Z",
  endedAt: "2026-06-22T21:30:00.000Z",
  durationMs: 3.5 * 60 * 60 * 1000,
  xpGained: 450,
  levelsGained: 1,
  itemsAcquired: [
    { name: "Healing Potion", qty: 2 },
    { name: "Longsword", qty: 1 },
  ],
  slotsSpent: { "1": 2, "3": 1 },
  spellsCast: 3,
  combatRounds: 4,
  attackRolls: 5,
  damageRolls: 4,
  featsOrAsis: [{ type: "featTaken", label: "Feat: Sharpshooter" }],
};

// journalEntries is set (even if empty) so the modal does NOT lazily fetch
// session detail — these tests exercise the rendered props directly.
const baseSession: Session = {
  id: "s1",
  characterId: "c1",
  status: "ended",
  startedAt: "2026-06-22T18:00:00.000Z",
  endedAt: "2026-06-22T21:30:00.000Z",
  title: "The Sunless Citadel",
  summary,
  journalEntries: [],
};

describe("SessionSummaryModal", () => {
  it("renders the headline aggregates and item list", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Session Recap — The Sunless Citadel/)).toBeInTheDocument();

    // Headline tiles.
    expect(screen.getByText("450")).toBeInTheDocument(); // XP
    expect(screen.getByText("XP gained")).toBeInTheDocument();
    expect(screen.getByText("Attack rolls")).toBeInTheDocument();

    // Secondary facts.
    expect(screen.getByText(/Gained 1 level/)).toBeInTheDocument();
    expect(screen.getByText(/4 combat rounds/)).toBeInTheDocument();
    expect(screen.getByText(/Feat: Sharpshooter/)).toBeInTheDocument();

    // Items acquired.
    expect(screen.getByText("Healing Potion")).toBeInTheDocument();
    expect(screen.getByText("Longsword")).toBeInTheDocument();
  });

  it("shows an empty-state for no acquired items", () => {
    const session: Session = { ...baseSession, summary: { ...summary, itemsAcquired: [] } };
    render(<SessionSummaryModal characterId="c1" session={session} onClose={() => {}} />);
    expect(screen.getByText("No items gained this session.")).toBeInTheDocument();
  });

  it("falls back gracefully when summary is null", () => {
    const session: Session = { ...baseSession, summary: null };
    render(<SessionSummaryModal characterId="c1" session={session} onClose={() => {}} />);
    expect(screen.getByText(/No summary is available/)).toBeInTheDocument();
  });

  it("renders the session's journal entries (expandable)", async () => {
    const user = userEvent.setup();
    const session: Session = {
      ...baseSession,
      journalEntries: [
        {
          id: "j1",
          title: "We found the dragon",
          date: "2026-06-22T00:00:00.000Z",
          body: "It was huge and very angry.",
        },
      ],
    };
    render(<SessionSummaryModal characterId="c1" session={session} onClose={() => {}} />);

    // Title shows; body is collapsed until clicked.
    expect(screen.getByText("We found the dragon")).toBeInTheDocument();
    expect(screen.queryByText("It was huge and very angry.")).not.toBeInTheDocument();

    await user.click(screen.getByText("We found the dragon"));
    expect(screen.getByText("It was huge and very angry.")).toBeInTheDocument();
  });

  it("shows a journal empty-state when there are no entries", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);
    expect(screen.getByText("No journal entries for this session.")).toBeInTheDocument();
  });

  it("awards XP retroactively with the explicit sessionId and refreshes the summary", async () => {
    const user = userEvent.setup();
    mockApplyXp.mockResolvedValue({} as Character);
    mockFetchSession.mockResolvedValue({
      ...baseSession,
      summary: { ...summary, xpGained: 950 },
      events: [],
    });

    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /add xp to this session/i }));
    await user.type(screen.getByLabelText(/^award xp$/i), "500");
    await user.click(screen.getByRole("button", { name: /^award$/i }));

    expect(mockApplyXp).toHaveBeenCalledWith("c1", [{ type: "award", amount: 500 }], "s1");
    // Summary tile reflects the refreshed value.
    expect(await screen.findByText("950")).toBeInTheDocument();
  });

  it("calls onClose when the Close control is used", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
