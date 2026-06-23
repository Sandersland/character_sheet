import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellsSection from "@/features/spells/SpellsSection";
import * as client from "@/api/client";
import type { Character, Spell } from "@/types/character";

// Mock the API client — SpellsSection is the orchestrator that batches
// spellcasting ops and swaps the returned Character via onUpdate.
vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
}));

const BLESS: Spell = {
  id: "entry-bless",
  name: "Bless",
  level: 1,
  school: "enchantment",
  prepared: true,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Concentration, up to 1 minute",
  description: "Bless up to three creatures.",
  concentration: true,
};

function makeCharacter(
  concentratingOn: { entryId: string; spellName: string } | null,
): Character {
  return {
    id: "char-1",
    level: 3,
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 16, wisdom: 10, charisma: 10,
    },
    classes: [{ name: "Wizard" }],
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 13,
      spellAttackBonus: 5,
      slots: [{ level: 1, total: 2, used: 0 }],
      arcana: [],
      spells: [BLESS],
      concentratingOn,
    },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SpellsSection concentration", () => {
  it("does not show the concentration banner when not concentrating", () => {
    render(<SpellsSection character={makeCharacter(null)} onUpdate={vi.fn()} />);
    expect(screen.queryByText(/Concentrating on/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /drop concentration/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a banner naming the active concentration spell", () => {
    render(
      <SpellsSection
        character={makeCharacter({ entryId: "entry-bless", spellName: "Bless" })}
        onUpdate={vi.fn()}
      />,
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/Concentrating on/i);
    expect(banner).toHaveTextContent("Bless");
  });

  it("fires a dropConcentration op when the drop control is clicked", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const mockApply = vi.mocked(client.applySpellcastingTransactions);
    mockApply.mockResolvedValue(makeCharacter(null));

    render(
      <SpellsSection
        character={makeCharacter({ entryId: "entry-bless", spellName: "Bless" })}
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /drop concentration/i }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "dropConcentration" }]);
  });

  it("marks the active concentration spell's badge as 'concentrating'", () => {
    render(
      <SpellsSection
        character={makeCharacter({ entryId: "entry-bless", spellName: "Bless" })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("concentrating")).toBeInTheDocument();
  });
});
