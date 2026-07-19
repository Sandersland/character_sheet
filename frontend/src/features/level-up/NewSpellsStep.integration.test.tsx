import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLevelUpPlan, fetchSpells, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import type { CatalogSpell, Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchLevelUpPlan: vi.fn(),
  submitLevelUp: vi.fn(),
  fetchSpells: vi.fn(),
  fetchReference: vi.fn(async () => ({ artisanTools: [] })),
}));

const planMock = vi.mocked(fetchLevelUpPlan);
const submitMock = vi.mocked(submitLevelUp);
const spellsMock = vi.mocked(fetchSpells);

function spell(id: string, level: number): CatalogSpell {
  return {
    id, name: id, level, school: "evocation", castingTime: "1 action",
    range: "60 ft", duration: "Instant", description: "", concentration: false,
    ritual: false, classes: ["wizard"], cantripScaling: false,
  };
}

// hitPoints/hitDice/abilityScores present because step 1 is the real HitPointsStep (#887).
const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "wizard", level: 2 }],
  resources: {},
  abilityScores: { strength: 8, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
  hitPoints: { current: 12, max: 12 },
  hitDice: { die: "d6", total: 2 },
  spellcasting: { slots: [], arcana: [], spells: [] },
} as unknown as Character;

function plan(steps: LevelUpStep[]): LevelUpPlanResponse {
  return { target: { className: "wizard", subclass: null, newLevel: 3, isPrimary: true }, steps };
}

function renderCeremony() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <Routes>
        <Route path="/characters/:id/level-up" element={<LevelUpCeremony character={character} />} />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  submitMock.mockResolvedValue({} as Character);
  spellsMock.mockResolvedValue([spell("Shield", 1), spell("MistyStep", 2), spell("Fireball", 3)]);
});

describe("NewSpellsStep in the ceremony", () => {
  it("gates Continue until 2 spells are picked, then submits spellsLearned", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "newSpells", count: 2, meta: { maxSpellLevel: 2 } }, { kind: "review" }]));
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // New Spells step: real NewSpellsStep renders the eligible catalog; Fireball (L3) is above the ceiling.
    expect(await screen.findByText("Shield")).toBeInTheDocument();
    expect(screen.queryByText("Fireball")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Shield/ }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /MistyStep/ }));
    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled());

    await user.click(cont);
    await user.click(await screen.findByRole("button", { name: /confirm level up/i }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith("c1", {
        target: { kind: "existing", classEntryId: "entry-1" },
        hp: { method: "average" },
        spellsLearned: [
          { type: "learnSpell", spellId: "Shield" },
          { type: "learnSpell", spellId: "MistyStep" },
        ],
      }),
    );
  });
});
