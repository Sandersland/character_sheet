import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AdvancementSection from "@/features/advancement/AdvancementSection";
import type { AdvancementEntry, Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
  applyAdvancementTransactions: vi.fn(),
}));

const noop = () => {};

function makeCharacter(advancements: AdvancementEntry[]): Character {
  return {
    id: "char-1",
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
    render(<AdvancementSection character={makeCharacter([featFull])} onUpdate={noop} />);
    expect(
      screen.getByText(
        "+2 Strength · +5/level max HP · +1 initiative · Prof: Athletics · Save prof: Constitution"
      )
    ).toBeInTheDocument();
  });

  it("falls back to the feat description when there is nothing to summarize", () => {
    render(<AdvancementSection character={makeCharacter([featFallback])} onUpdate={noop} />);
    expect(screen.getByText("Grants darkvision.")).toBeInTheDocument();
  });

  it("renders the full ASI detail joined with ', '", () => {
    render(<AdvancementSection character={makeCharacter([asiFull])} onUpdate={noop} />);
    expect(screen.getByText("+5 max HP, +3 initiative")).toBeInTheDocument();
  });

  it("renders no detail line for an all-zero ASI", () => {
    const { container } = render(
      <AdvancementSection character={makeCharacter([asiEmpty])} onUpdate={noop} />
    );
    expect(container.querySelectorAll("p.leading-relaxed").length).toBe(0);
  });
});
