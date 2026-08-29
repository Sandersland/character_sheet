import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LiveTurnBody from "@/features/session/LiveTurnBody";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, Session } from "@/types/character";
import type { TurnStateView } from "@/features/session/useTurnState";

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
    renderWithCharacter(
      <LiveTurnBody
        session={session}
        turnState={turnState}
        onLogChanged={vi.fn()}
      />,
      makeCharacter(),
  );
    expect(screen.getByTestId("turn-hub")).toBeInTheDocument();
  });

  it("no longer nests conditions or a rest control (moved to sibling slots)", () => {
    renderWithCharacter(
      <LiveTurnBody
        session={session}
        turnState={turnState}
        onLogChanged={vi.fn()}
      />,
      makeCharacter(),
  );
    expect(screen.queryByText("Conditions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rest" })).not.toBeInTheDocument();
  });

  it("forwards onOpenLog to the hub", async () => {
    const onOpenLog = vi.fn();
    const user = userEvent.setup();
    renderWithCharacter(
      <LiveTurnBody
        session={session}
        turnState={turnState}
        onLogChanged={vi.fn()}
        onOpenLog={onOpenLog}
      />,
      makeCharacter(),
  );
    await user.click(screen.getByRole("button", { name: "open-log" }));
    expect(onOpenLog).toHaveBeenCalledTimes(1);
  });
});
