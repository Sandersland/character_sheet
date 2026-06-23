import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import type { Session, SessionSummary } from "@/types/character";

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

const baseSession: Session = {
  id: "s1",
  characterId: "c1",
  status: "ended",
  startedAt: "2026-06-22T18:00:00.000Z",
  endedAt: "2026-06-22T21:30:00.000Z",
  title: "The Sunless Citadel",
  summary,
};

describe("SessionSummaryModal", () => {
  it("renders the headline aggregates and item list", () => {
    render(<SessionSummaryModal session={baseSession} onClose={() => {}} />);

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
    render(<SessionSummaryModal session={session} onClose={() => {}} />);
    expect(screen.getByText("No items gained this session.")).toBeInTheDocument();
  });

  it("falls back gracefully when summary is null", () => {
    const session: Session = { ...baseSession, summary: null };
    render(<SessionSummaryModal session={session} onClose={() => {}} />);
    expect(screen.getByText(/No summary is available/)).toBeInTheDocument();
  });

  it("calls onClose when the Close control is used", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummaryModal session={baseSession} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
