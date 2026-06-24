import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import * as client from "@/api/client";
import type { Character, CharacterResources } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyClassTransactions: vi.fn(),
  applyResourceTransactions: vi.fn(),
}));

function makeCharacter(resources: Partial<CharacterResources>): Character {
  return {
    id: "char-1",
    class: "Fighter",
    level: 5,
    resources: {
      features: [],
      pools: [],
      maneuversKnown: [],
      toolProficienciesKnown: [],
      ...resources,
    },
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClassFeaturesSection — Fighting Style", () => {
  it("renders the Fighting Style picker when fightingStyleChoiceCount > 0 and none chosen", () => {
    render(
      <ClassFeaturesSection
        character={makeCharacter({ fightingStyleChoiceCount: 1, fightingStyle: null })}
        referenceClasses={[]}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("Fighting Style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose a fighting style/i })).toBeInTheDocument();
  });

  it("does NOT render the Fighting Style section when not entitled", () => {
    render(
      <ClassFeaturesSection
        character={makeCharacter({ fightingStyleChoiceCount: 0 })}
        referenceClasses={[]}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.queryByText("Fighting Style")).not.toBeInTheDocument();
  });

  it("shows the chosen style label + description (never the raw key) when set", () => {
    render(
      <ClassFeaturesSection
        character={makeCharacter({ fightingStyleChoiceCount: 1, fightingStyle: "archery" })}
        referenceClasses={[]}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText("Archery")).toBeInTheDocument();
    expect(screen.queryByText("archery")).not.toBeInTheDocument();
    // Description text present.
    expect(screen.getByText(/\+2 bonus to attack rolls/i)).toBeInTheDocument();
  });

  it("choosing a style calls applyClassTransactions with a setFightingStyle op", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const mockApply = vi.mocked(client.applyClassTransactions);
    mockApply.mockResolvedValue(
      makeCharacter({ fightingStyleChoiceCount: 1, fightingStyle: "archery" }),
    );

    render(
      <ClassFeaturesSection
        character={makeCharacter({ fightingStyleChoiceCount: 1, fightingStyle: null })}
        referenceClasses={[]}
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /choose a fighting style/i }));
    const archeryRow = screen.getByText("Archery").closest("li")!;
    await user.click(within(archeryRow).getByRole("button", { name: "Choose" }));

    expect(mockApply).toHaveBeenCalledWith("char-1", [{ type: "setFightingStyle", key: "archery" }]);
  });
});
