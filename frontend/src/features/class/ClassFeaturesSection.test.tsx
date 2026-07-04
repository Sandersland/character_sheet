import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import { RollProvider } from "@/features/dice/RollContext";
import * as client from "@/api/client";
import type { CatalogDiscipline, Character, CharacterResources } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyClassTransactions: vi.fn(),
  applyResourceTransactions: vi.fn(),
  applyDisciplineTransactions: vi.fn(),
  fetchDisciplines: vi.fn(),
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

describe("ClassFeaturesSection — Elemental Disciplines", () => {
  const DISCIPLINE_CATALOG: CatalogDiscipline[] = [
    {
      id: "fangs",
      name: "Fangs of the Fire Snake",
      description: "Extend reach and deal fire damage.",
      minLevel: 3,
      alwaysKnown: false,
      saveAbility: null,
      cost: { kind: "pool", key: "ki", base: 1, perStep: 1 },
      effect: { effectType: "damage", dice: { count: 1, faces: 10, modifier: 0 }, damageType: "fire", attackType: "attack", saveAbility: null, saveEffect: null, scaling: { mode: "ki", dicePerStep: 1 } },
    },
    {
      id: "thunders",
      name: "Fist of Four Thunders",
      description: "Cast thunderwave.",
      minLevel: 3,
      alwaysKnown: false,
      saveAbility: "constitution",
      cost: { kind: "pool", key: "ki", base: 2 },
      effect: { effectType: "damage", dice: { count: 3, faces: 8, modifier: 0 }, damageType: "thunder", attackType: "save", saveAbility: "constitution", saveEffect: "half", scaling: { mode: "ki", dicePerStep: 0 } },
    },
  ];

  function makeMonk(): Character {
    return {
      id: "char-1",
      class: "Monk",
      level: 6,
      subclass: "Way of the Four Elements",
      resources: {
        features: [],
        pools: [{ key: "ki", label: "Ki", total: 6, recharge: "shortRest", used: 0, remaining: 6 }],
        maneuversKnown: [],
        toolProficienciesKnown: [],
        disciplineChoiceCount: 2,
        disciplineSaveDC: 13,
        disciplinesKnown: [{ id: "entry-1", disciplineId: "fangs", name: "Fangs of the Fire Snake", description: "Extend reach and deal fire damage." }],
      },
    } as unknown as Character;
  }

  beforeEach(() => {
    vi.mocked(client.fetchDisciplines).mockResolvedValue(DISCIPLINE_CATALOG);
  });

  it("renders the discipline block for a Four Elements monk and casts through applyDisciplineTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyDisciplineTransactions).mockResolvedValue(makeMonk());

    render(
      <RollProvider>
        <ClassFeaturesSection character={makeMonk()} referenceClasses={[]} onUpdate={vi.fn()} />
      </RollProvider>,
    );

    expect(screen.getByText("Elemental Disciplines")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fangs of the Fire Snake")).toBeInTheDocument());

    const fangsRow = screen.getByText("Fangs of the Fire Snake").closest("li")!;
    await user.click(within(fangsRow).getByRole("button", { name: "Cast" }));

    await waitFor(() => expect(client.applyDisciplineTransactions).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(client.applyDisciplineTransactions).mock.calls[0];
    expect(ops[0]).toMatchObject({ type: "castDiscipline", disciplineId: "fangs", kiSpent: 1 });
  });

  it("learns a discipline through applyResourceTransactions", async () => {
    const user = userEvent.setup();
    vi.mocked(client.applyResourceTransactions).mockResolvedValue(makeMonk());

    render(
      <RollProvider>
        <ClassFeaturesSection character={makeMonk()} referenceClasses={[]} onUpdate={vi.fn()} />
      </RollProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /learn discipline/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /learn discipline/i }));
    const thunderRow = screen.getByText("Fist of Four Thunders").closest("li")!;
    await user.click(within(thunderRow).getByRole("button", { name: "Learn" }));

    expect(client.applyResourceTransactions).toHaveBeenCalledWith("char-1", [
      { type: "learnDiscipline", disciplineId: "thunders" },
    ]);
  });
});
