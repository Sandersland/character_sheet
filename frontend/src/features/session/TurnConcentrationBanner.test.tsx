import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TurnConcentrationBanner from "@/features/session/TurnConcentrationBanner";
import { applySpellcastingTransactions } from "@/api/client";
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
    const { container } = render(
      <TurnConcentrationBanner character={makeCharacter(null)} onUpdate={vi.fn()} onLogChanged={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the concentrated spell name", () => {
    render(
      <TurnConcentrationBanner
        character={makeCharacter({ entryId: "e1", spellName: "Bless" })}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Bless")).toBeInTheDocument();
  });

  it("Drop ends concentration through the spellcasting transaction endpoint", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onLogChanged = vi.fn();
    const updated = makeCharacter(null);
    vi.mocked(applySpellcastingTransactions).mockResolvedValue(updated);

    render(
      <TurnConcentrationBanner
        character={makeCharacter({ entryId: "e1", spellName: "Bless" })}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Drop concentration/i }));

    await waitFor(() =>
      expect(applySpellcastingTransactions).toHaveBeenCalledWith("char-1", [
        { type: "dropConcentration" },
      ]),
    );
    expect(onUpdate).toHaveBeenCalledWith(updated);
    expect(onLogChanged).toHaveBeenCalled();
  });
});
