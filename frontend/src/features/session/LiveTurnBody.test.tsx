import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import LiveTurnBody from "@/features/session/LiveTurnBody";
import type { Character, Session } from "@/types/character";
import type { TurnStateView } from "@/features/session/useTurnState";

// The turn engine is out of scope for this composition test (#982): stub the hub
// so we assert *ordering*, not turn machinery. The real TurnHub carries its own
// dice/roll providers — mocking it keeps this test to LiveTurnBody's layout.
vi.mock("@/features/session/TurnHub", () => ({
  default: () => <div data-testid="turn-hub">Turn Hub</div>,
}));

// No API call fires on render; mock the client so the vitals + conditions
// surfaces mount without hitting the network.
vi.mock("@/api/client", () => ({
  applyConditionTransactions: vi.fn(),
  applyHitPointOperations: vi.fn(),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    conditions: { active: [], exhaustion: 0 },
    hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 5, spent: 0, die: "d10" },
    ...overrides,
  } as unknown as Character;
}

const session = { id: "sess-1", participants: [] } as unknown as Session;
const turnState = {} as unknown as TurnStateView;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LiveTurnBody composition (#982)", () => {
  it("renders the turn tracker (hero) before the conditions/utility strip", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );

    const hub = screen.getByTestId("turn-hub");
    const conditionsLabel = screen.getByText("Conditions");
    // conditionsLabel must FOLLOW the hub in document order (4 = FOLLOWING).
    expect(hub.compareDocumentPosition(conditionsLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps HP out of the mobile utility rows (mobile carries HP in its header)", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );

    // jsdom's matchMedia stub renders the mobile utility rows, which stay HP-free —
    // mobile keeps its HP readout in the sheet header. The desktop live-play HP
    // entry lives on the desktop utility line instead (#1085, covered in
    // CombatUtilityStrip.test).
    expect(screen.queryByRole("button", { name: /manage hit points/i })).not.toBeInTheDocument();
  });

  it("collapses the empty conditions state to a single compact line, not a full card", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );

    // The quiet one-line strip shows "none" — not the full-height empty-state card.
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.queryByText(/no active conditions/i)).not.toBeInTheDocument();
  });

  it("keeps Rest reachable from the utility strip", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Rest" })).toBeInTheDocument();
  });
});
