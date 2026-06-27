import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import SessionLog from "@/features/session/SessionLog";
import { fetchSession } from "@/api/client";
import type { CharacterEvent } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSession: vi.fn(),
}));

const mockFetchSession = vi.mocked(fetchSession);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEvent(overrides: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "evt-1",
    category: "combat",
    type: "attackRoll",
    summary: "Longsword: 17 (1d20 + 5)",
    actor: "player",
    reverted: false,
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function renderWith(events: CharacterEvent[]) {
  mockFetchSession.mockResolvedValue({ events } as never);
  return render(<SessionLog characterId="char-1" sessionId="sess-1" refreshKey={0} />);
}

describe("SessionLog roll breakdown", () => {
  it("shows the raw die breakdown for a roll event with faces", async () => {
    renderWith([
      makeEvent({
        type: "attackRoll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { source: "Longsword", total: 17, specLabel: "1d20 + 5", faces: [12] },
      }),
    ]);

    expect(await screen.findByText("Longsword: 17 (1d20 (12) + 5)")).toBeInTheDocument();
  });

  it("includes damage type and multi-die faces", async () => {
    renderWith([
      makeEvent({
        id: "evt-dmg",
        type: "damageRoll",
        summary: "Longsword: 8 slashing (2d6)",
        data: {
          source: "Longsword",
          total: 8,
          specLabel: "2d6",
          damageType: "slashing",
          faces: [3, 5],
        },
      }),
    ]);

    expect(await screen.findByText("Longsword: 8 slashing (2d6 (3, 5))")).toBeInTheDocument();
  });

  it("falls back to the stored summary for old events without faces", async () => {
    renderWith([
      makeEvent({
        type: "attackRoll",
        summary: "Longsword: 17 (1d20 + 5)",
        data: { source: "Longsword", total: 17, specLabel: "1d20 + 5", faces: null },
      }),
    ]);

    expect(await screen.findByText("Longsword: 17 (1d20 + 5)")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/\(1d20 \(/)).not.toBeInTheDocument(),
    );
  });
});
