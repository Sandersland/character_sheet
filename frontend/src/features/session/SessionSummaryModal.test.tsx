import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import { applyExperienceOperations, fetchSession } from "@/api/client";
import type {
  CampaignRecap,
  Character,
  ParticipantSummary,
  Session,
  SessionParticipant,
} from "@/types/character";

vi.mock("@/api/client", () => ({
  applyExperienceOperations: vi.fn(),
  fetchSession: vi.fn(),
}));

const mockApplyXp = vi.mocked(applyExperienceOperations);
const mockFetchSession = vi.mocked(fetchSession);

beforeEach(() => {
  vi.clearAllMocks();
});

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
  itemsAcquired: [
    { name: "Healing Potion", qty: 2 },
    { name: "Longsword", qty: 1 },
  ],
  totalPresentMs: 6 * 60 * 60 * 1000,
};

function participantSummary(overrides: Partial<ParticipantSummary>): ParticipantSummary {
  return {
    startedAt: "2026-06-22T18:00:00.000Z",
    endedAt: "2026-06-22T21:30:00.000Z",
    durationMs: 3.5 * 60 * 60 * 1000,
    xpGained: 225,
    levelsGained: 0,
    itemsAcquired: [],
    slotsSpent: {},
    spellsCast: 1,
    combatRounds: 4,
    attackRolls: 2,
    damageRolls: 2,
    featsOrAsis: [],
    characterId: "c1",
    characterName: "Aldric",
    joinedAt: "2026-06-22T18:00:00.000Z",
    leftAt: null,
    presentMs: 3.5 * 60 * 60 * 1000,
    ...overrides,
  };
}

function participant(overrides: Partial<SessionParticipant>): SessionParticipant {
  return {
    id: `p-${overrides.characterId ?? "c1"}`,
    sessionId: "s1",
    characterId: "c1",
    joinedAt: "2026-06-22T18:00:00.000Z",
    leftAt: null,
    summary: participantSummary({}),
    ...overrides,
  };
}

const participants: SessionParticipant[] = [
  participant({ characterId: "c1", summary: participantSummary({ characterId: "c1", characterName: "Aldric" }) }),
  participant({
    characterId: "c2",
    summary: participantSummary({ characterId: "c2", characterName: "Bromm", xpGained: 225 }),
  }),
];

// journalEntries is set (even if empty) so the modal does NOT lazily fetch
// session detail — these tests exercise the rendered props directly.
const baseSession: Session = {
  id: "s1",
  campaignId: "camp1",
  status: "ended",
  startedAt: "2026-06-22T18:00:00.000Z",
  endedAt: "2026-06-22T21:30:00.000Z",
  title: "The Sunless Citadel",
  summary: recap,
  participants,
  journalEntries: [],
};

describe("SessionSummaryModal", () => {
  it("renders the campaign recap aggregates, party size, and item list", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Session Recap — The Sunless Citadel/)).toBeInTheDocument();

    // Recap tiles + party size.
    expect(screen.getByText("450")).toBeInTheDocument(); // XP gained (recap)
    expect(screen.getByText("XP gained")).toBeInTheDocument();
    expect(screen.getByText("Attack rolls")).toBeInTheDocument();
    expect(screen.getByText(/2 players/)).toBeInTheDocument();

    // Secondary facts.
    expect(screen.getByText(/Gained 1 level/)).toBeInTheDocument();
    expect(screen.getByText(/4 combat rounds/)).toBeInTheDocument();

    // Items acquired (party-wide).
    expect(screen.getByText("Healing Potion")).toBeInTheDocument();
    expect(screen.getByText("Longsword")).toBeInTheDocument();
  });

  it("lists each participant with their name and present time", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);
    expect(screen.getByText("Participants")).toBeInTheDocument();
    expect(screen.getByText("Aldric")).toBeInTheDocument();
    expect(screen.getByText("Bromm")).toBeInTheDocument();
    // Each participant card shows their present duration.
    expect(screen.getAllByText(/present/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty-state for no acquired items", () => {
    const session: Session = { ...baseSession, summary: { ...recap, itemsAcquired: [] } };
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
          kind: "ENTRY",
          title: "We found the dragon",
          date: "2026-06-22T00:00:00.000Z",
          loggedAt: "2026-06-22T00:00:00.000Z",
          body: "It was huge and very angry.",
          visibility: "PRIVATE",
        },
      ],
    };
    render(<SessionSummaryModal characterId="c1" session={session} onClose={() => {}} />);

    expect(screen.getByText("We found the dragon")).toBeInTheDocument();
    expect(screen.queryByText("It was huge and very angry.")).not.toBeInTheDocument();

    await user.click(screen.getByText("We found the dragon"));
    expect(screen.getByText("It was huge and very angry.")).toBeInTheDocument();
  });

  it("shows a journal empty-state when there are no entries", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);
    expect(screen.getByText("No journal entries for this session.")).toBeInTheDocument();
  });

  it("awards XP retroactively with the explicit sessionId and refreshes the recap", async () => {
    const user = userEvent.setup();
    mockApplyXp.mockResolvedValue({} as Character);
    mockFetchSession.mockResolvedValue({
      ...baseSession,
      summary: { ...recap, xpGained: 950 },
      events: [],
    });

    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /add xp to this session/i }));
    await user.type(screen.getByLabelText(/^award xp$/i), "500");
    await user.click(screen.getByRole("button", { name: /^award$/i }));

    expect(mockApplyXp).toHaveBeenCalledWith("c1", [{ type: "award", amount: 500 }], "s1");
    expect(await screen.findByText("950")).toBeInTheDocument();
  });

  it("hides the retroactive-XP affordance when the session is still active", () => {
    const session: Session = { ...baseSession, status: "active" };
    render(<SessionSummaryModal characterId="c1" session={session} onClose={() => {}} />);
    expect(
      screen.queryByRole("button", { name: /add xp to this session/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the retroactive-XP affordance when the session is ended", () => {
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: /add xp to this session/i }),
    ).toBeInTheDocument();
  });

  it("calls onCharacterUpdate with the updated character after a successful award", async () => {
    const user = userEvent.setup();
    const updatedCharacter = { id: "c1", experiencePoints: 950 } as Character;
    const onCharacterUpdate = vi.fn();
    mockApplyXp.mockResolvedValue(updatedCharacter);
    mockFetchSession.mockResolvedValue({
      ...baseSession,
      summary: { ...recap, xpGained: 950 },
      events: [],
    });

    render(
      <SessionSummaryModal
        characterId="c1"
        session={baseSession}
        onClose={() => {}}
        onCharacterUpdate={onCharacterUpdate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add xp to this session/i }));
    await user.type(screen.getByLabelText(/^award xp$/i), "500");
    await user.click(screen.getByRole("button", { name: /^award$/i }));

    expect(await screen.findByText("950")).toBeInTheDocument();
    expect(onCharacterUpdate).toHaveBeenCalledWith(updatedCharacter);
  });

  it("calls onClose when the Close control is used", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummaryModal characterId="c1" session={baseSession} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
