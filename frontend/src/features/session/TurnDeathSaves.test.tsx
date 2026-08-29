import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnDeathSaves from "@/features/session/TurnDeathSaves";
import { applyHitPointOperations } from "@/api/client";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
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
    const character = makeCharacter(12);
    const { container } = renderWithCharacter(<TurnDeathSaves />, character);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the death-save tracker at 0 HP without a redundant wrapper card", () => {
    const character = makeCharacter(0);
    renderWithCharacter(<TurnDeathSaves />, character);
    expect(screen.getByText(/Unconscious — Roll Death Saves/i)).toBeInTheDocument();
    expect(screen.queryByText(/Dying — death saves/i)).not.toBeInTheDocument();
  });

  it("surfaces a transaction failure instead of silently swallowing it (#744)", async () => {
    const user = userEvent.setup();
    vi.mocked(applyHitPointOperations).mockRejectedValue(new Error("Death save failed."));

    const character = makeCharacter(0);
    renderWithCharacter(<TurnDeathSaves />, character);
    await user.click(screen.getByRole("button", { name: /Roll Death Save/i }));

    expect(await screen.findByText(/Death save failed\./i)).toBeInTheDocument();
  });

  it("rolls a death save through the HP transaction endpoint", async () => {
    const user = userEvent.setup();
    const updated = makeCharacter(0);
    vi.mocked(applyHitPointOperations).mockResolvedValue({ character: updated, concentrationChecks: [] } as never);

    const character = makeCharacter(0);
    renderWithCharacter(<TurnDeathSaves />, character);
    await user.click(screen.getByRole("button", { name: /Roll Death Save/i }));

    await waitFor(() =>
      expect(applyHitPointOperations).toHaveBeenCalledWith("char-1", [
        { type: "deathSave", roll: expect.any(Number) },
      ]),
    );
    expect(cachedCharacter("char-1")).toEqual(updated);
  });
});
