import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnConcentrationBanner from "@/features/session/TurnConcentrationBanner";
import { applySpellcastingTransactions } from "@/api/client";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
}));

function makeCharacter(concentratingOn: { entryId: string; spellName: string } | null): Character {
  return {
    id: "char-1",
    spellcasting: { concentratingOn },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TurnConcentrationBanner (#735)", () => {
  it("renders nothing when not concentrating", () => {
    const character = makeCharacter(null);
    const { container } = renderWithCharacter(
      <TurnConcentrationBanner onLogChanged={vi.fn()} />,
      character,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the concentrated spell name", () => {
    const character = makeCharacter({ entryId: "e1", spellName: "Bless" });
    renderWithCharacter(
      <TurnConcentrationBanner onLogChanged={vi.fn()} />,
      character,
    );
    expect(screen.getByText("Bless")).toBeInTheDocument();
  });

  it("Drop ends concentration through the spellcasting transaction endpoint", async () => {
    const user = userEvent.setup();
    const onLogChanged = vi.fn();
    const updated = makeCharacter(null);
    vi.mocked(applySpellcastingTransactions).mockResolvedValue(updated);

    const character = makeCharacter({ entryId: "e1", spellName: "Bless" });
    renderWithCharacter(
      <TurnConcentrationBanner onLogChanged={onLogChanged} />,
      character,
    );

    await user.click(screen.getByRole("button", { name: /Drop concentration/i }));

    await waitFor(() =>
      expect(applySpellcastingTransactions).toHaveBeenCalledWith("char-1", [
        { type: "dropConcentration" },
      ]),
    );
    expect(cachedCharacter("char-1")).toEqual(updated);
    expect(onLogChanged).toHaveBeenCalled();
  });
});
