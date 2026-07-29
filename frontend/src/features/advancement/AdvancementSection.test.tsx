import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchFeats } from "@/api/client";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { AdvancementEntry, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
  applyAdvancementTransactions: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// AdvancementSection reads useCurrentCharacter(), so every render seeds the
// cache and mounts CurrentCharacterProvider via renderWithCharacter.
function render(character: Character) {
  return renderWithCharacter(<AdvancementSection />, character);
}

function makeCharacter(advancements: AdvancementEntry[]): Character {
  return {
    id: "char-1",
    rulesEdition: "EDITION_2014",
    level: 4,
    advancements,
    advancementSlots: { total: 0, used: 0 },
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    skills: [],
  } as unknown as Character;
}

// Separate from makeCharacter, which the entryDetail cases below depend on
// holding zero slots — an open slot swaps the disabled button those render for
// a live picker with a tab bar.
function makeCharacterWithSlot(rulesEdition: string): Character {
  return {
    ...makeCharacter([]),
    rulesEdition,
    advancementSlots: { total: 1, used: 0 },
  } as unknown as Character;
}

const featFull: AdvancementEntry = {
  id: "e1",
  level: 4,
  kind: "feat",
  abilityDeltas: { strength: 2 },
  hpDelta: 0,
  initDelta: 0,
  improvements: [
    { target: "maxHp", amount: 5, perLevel: true },
    { target: "initiative", amount: 1 },
    { target: "skillProficiency", key: "athletics", amount: 0 },
    { target: "savingThrowProficiency", key: "constitution", amount: 0 },
  ],
};

const featFallback: AdvancementEntry = {
  id: "e2",
  level: 8,
  kind: "feat",
  abilityDeltas: {},
  hpDelta: 0,
  initDelta: 0,
  featDescription: "Grants darkvision.",
};

const asiFull: AdvancementEntry = {
  id: "e3",
  level: 12,
  kind: "asi",
  abilityDeltas: {},
  hpDelta: 5,
  initDelta: 3,
};

const asiEmpty: AdvancementEntry = {
  id: "e4",
  level: 16,
  kind: "asi",
  abilityDeltas: {},
  hpDelta: 0,
  initDelta: 0,
};

describe("AdvancementSection entryDetail rendering", () => {
  it("renders the full feat detail joined with ' · '", () => {
    render(makeCharacter([featFull]));
    expect(
      screen.getByText(
        "+2 Strength · +5/level max HP · +1 initiative · Prof: Athletics · Save prof: Constitution"
      )
    ).toBeInTheDocument();
  });

  it("falls back to the feat description when there is nothing to summarize", () => {
    render(makeCharacter([featFallback]));
    expect(screen.getByText("Grants darkvision.")).toBeInTheDocument();
  });

  it("renders the full ASI detail joined with ', '", () => {
    render(makeCharacter([asiFull]));
    expect(screen.getByText("+5 max HP, +3 initiative")).toBeInTheDocument();
  });

  it("renders no detail line for an all-zero ASI", () => {
    const { container } = render(makeCharacter([asiEmpty]));
    expect(container.querySelectorAll("p.leading-relaxed").length).toBe(0);
  });
});

describe("AdvancementSection — feat picker edition (#1411)", () => {
  async function openFeatTab(rulesEdition: string) {
    const user = userEvent.setup();
    render(makeCharacterWithSlot(rulesEdition));
    await user.click(screen.getByRole("button", { name: /choose advancement/i }));
    await user.click(screen.getByRole("button", { name: "Feat" }));
  }

  it("fetches the 2014 catalog for a 2014 character", async () => {
    await openFeatTab("EDITION_2014");
    expect(fetchFeats).toHaveBeenCalledWith("EDITION_2014");
  });

  it("fetches the 2024 catalog for a 2024 character", async () => {
    await openFeatTab("EDITION_2024");
    expect(fetchFeats).toHaveBeenCalledWith("EDITION_2024");
  });
});
