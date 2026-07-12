import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnDeathSaves from "@/features/session/TurnDeathSaves";
import { applyHitPointOperations } from "@/api/client";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
}));

function makeCharacter(current: number): Character {
  return {
    id: "char-1",
    hitPoints: { current, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TurnDeathSaves (#736)", () => {
  it("renders nothing above 0 HP", () => {
    const { container } = render(<TurnDeathSaves character={makeCharacter(12)} onUpdate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the death-save tracker at 0 HP without a redundant wrapper card", () => {
    render(<TurnDeathSaves character={makeCharacter(0)} onUpdate={vi.fn()} />);
    // DeathSaveTracker supplies its own garnet card + heading; the old outer
    // "Dying — death saves" wrapper is gone (single card, #744 review).
    expect(screen.getByText(/Unconscious — Roll Death Saves/i)).toBeInTheDocument();
    expect(screen.queryByText(/Dying — death saves/i)).not.toBeInTheDocument();
  });

  it("surfaces a transaction failure instead of silently swallowing it (#744)", async () => {
    const user = userEvent.setup();
    vi.mocked(applyHitPointOperations).mockRejectedValue(new Error("Death save failed."));

    render(<TurnDeathSaves character={makeCharacter(0)} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Roll Death Save/i }));

    expect(await screen.findByText(/Death save failed\./i)).toBeInTheDocument();
  });

  it("rolls a death save through the HP transaction endpoint", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const updated = makeCharacter(0);
    vi.mocked(applyHitPointOperations).mockResolvedValue({ character: updated, concentrationChecks: [] } as never);

    render(<TurnDeathSaves character={makeCharacter(0)} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: /Roll Death Save/i }));

    await waitFor(() =>
      expect(applyHitPointOperations).toHaveBeenCalledWith("char-1", [
        { type: "deathSave", roll: expect.any(Number) },
      ]),
    );
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });
});
