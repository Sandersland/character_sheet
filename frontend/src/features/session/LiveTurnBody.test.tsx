import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LiveTurnBody from "@/features/session/LiveTurnBody";
import type { Character, Session } from "@/types/character";
import type { TurnStateView } from "@/features/session/useTurnState";

// The turn engine is out of scope (#1086): stub the hub so we assert only that
// LiveTurnBody renders it and forwards the log opener. HP / conditions / rest are
// no longer nested here — they're sibling CombatColumn slots.
vi.mock("@/features/session/TurnHub", () => ({
  default: ({ onOpenLog }: { onOpenLog?: () => void }) => (
    <div data-testid="turn-hub">
      <button type="button" onClick={onOpenLog}>
        open-log
      </button>
    </div>
  ),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return { id: "char-1", ...overrides } as unknown as Character;
}

const session = { id: "sess-1", participants: [] } as unknown as Session;
const turnState = {} as unknown as TurnStateView;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LiveTurnBody (#1086)", () => {
  it("renders the turn hub", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );
    expect(screen.getByTestId("turn-hub")).toBeInTheDocument();
  });

  it("no longer nests conditions or a rest control (moved to sibling slots)", () => {
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );
    expect(screen.queryByText("Conditions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rest" })).not.toBeInTheDocument();
  });

  it("forwards onOpenLog to the hub", async () => {
    const onOpenLog = vi.fn();
    const user = userEvent.setup();
    render(
      <LiveTurnBody
        character={makeCharacter()}
        session={session}
        turnState={turnState}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
        onOpenLog={onOpenLog}
      />,
    );
    await user.click(screen.getByRole("button", { name: "open-log" }));
    expect(onOpenLog).toHaveBeenCalledTimes(1);
  });
});
