import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import CombatLogRow from "@/features/session/CombatLogRow";
import { fetchSession, fetchSessions } from "@/api/client";
import type { CharacterEvent } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSession: vi.fn(),
  fetchSessions: vi.fn(),
}));

const mockFetchSession = vi.mocked(fetchSession);
const mockFetchSessions = vi.mocked(fetchSessions);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEvent(overrides: Partial<CharacterEvent>): CharacterEvent {
  return {
    id: "evt-1",
    category: "roll",
    type: "attackRoll",
    summary: "Shortsword: 17 (1d20 + 5)",
    actor: "player",
    reverted: false,
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

// #1237 §4: the badge must count rendered FEED ROWS (a merged attack+damage
// swing is ONE row from TWO events), not raw events — this is what a revert to
// `data.events.length` breaks. Both assertions below fail under that mutation.
describe("CombatLogRow live count (#1237 §4 — count parity with the rendered feed)", () => {
  it("counts a merged attack+damage swing as ONE event, not two", async () => {
    mockFetchSession.mockResolvedValue({
      events: [
        makeEvent({
          id: "dmg",
          type: "damageRoll",
          data: { kind: "damage", source: "Shortsword", total: 8, damageType: "piercing", specLabel: "1d6 + 4", faces: [4], swingId: "s1", verdict: "hit" },
        }),
        makeEvent({
          id: "atk",
          type: "attackRoll",
          data: { kind: "attack", source: "Shortsword", total: 17, specLabel: "1d20 + 5", faces: [12], swingId: "s1", verdict: "hit" },
        }),
      ],
    } as never);

    render(<CombatLogRow mode="live" characterId="char-1" sessionId="sess-1" onOpen={() => {}} />);

    expect(await screen.findByText("Session log · 1 event")).toBeInTheDocument();
    expect(screen.queryByText(/2 events/)).not.toBeInTheDocument();
  });

  it("still counts a hidden (collapsed-run) row as content, not zero", async () => {
    const misses = Array.from({ length: 5 }, (_, i) =>
      makeEvent({
        id: `miss-${i}`,
        data: { kind: "attack", source: "Dagger", total: 9 - i, specLabel: "1d20 + 2", faces: [7 - i], swingId: `miss-${i}`, verdict: "miss" },
      }),
    );
    mockFetchSession.mockResolvedValue({ events: misses } as never);

    render(<CombatLogRow mode="live" characterId="char-1" sessionId="sess-1" onOpen={() => {}} />);

    // 5 rows collapse to a 3-visible disclosure in the rendered feed, but all 5
    // are still log content — the badge must not drop to 3.
    expect(await screen.findByText("Session log · 5 events")).toBeInTheDocument();
  });
});

describe("CombatLogRow idle row", () => {
  it("renders the most recently ended session's label", async () => {
    mockFetchSessions.mockResolvedValue([
      { id: "sess-9", status: "ended", startedAt: "2026-01-01T00:00:00.000Z", title: "The Sunless Citadel" },
    ] as never);

    render(<CombatLogRow mode="idle" characterId="char-1" onOpen={() => {}} />);

    expect(await screen.findByText(/Last session · The Sunless Citadel/)).toBeInTheDocument();
  });
});
