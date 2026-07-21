import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference, submitLevelUp } from "@/api/client";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { axe } from "@/test/axe";
import type { Character, LevelUpPlanResponse, LevelUpStep, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchLevelUpPlan: vi.fn(), fetchReference: vi.fn(), submitLevelUp: vi.fn() }));

const planMock = vi.mocked(fetchLevelUpPlan);
const referenceMock = vi.mocked(fetchReference);
const submitMock = vi.mocked(submitLevelUp);

const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  hitPoints: { current: 52, max: 52, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 7, die: "d10", spent: 0 },
} as unknown as Character;

function plan(steps: LevelUpStep[], target?: Partial<LevelUpPlanResponse["target"]>): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true, ...target },
    steps,
    grantedSpells: [],
  };
}

function renderCeremony(over?: {
  character?: Character;
  onCharacterChange?: (updated: Character) => void;
  url?: string;
}) {
  return render(
    <MemoryRouter initialEntries={[over?.url ?? "/characters/c1/level-up"]}>
      <Routes>
        <Route
          path="/characters/:id/level-up"
          element={
            <LevelUpCeremony
              character={over?.character ?? character}
              onCharacterChange={over?.onCharacterChange}
            />
          }
        />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  referenceMock.mockResolvedValue({
    races: [],
    classes: [],
    backgrounds: [],
    alignments: [],
    artisanTools: [],
  } as unknown as ReferenceData);
});

describe("LevelUpCeremony", () => {
  it("renders the plan's rail, the level transition, and the step kicker", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual([
      "Step 1: Hit Points",
      "Step 2: Ability Score / Feat",
      "Step 3: Review",
    ]);
    expect(screen.getByText(/fighter · Champion/i)).toBeInTheDocument();
    // "Level 7 → 8" is split across spans — anchor on the heading.
    expect(screen.getByRole("heading", { name: /Level\s*7\s*→\s*8/ })).toBeInTheDocument();
  });

  it("Continue advances, then disables on a step the draft can't satisfy; Back returns", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    // Continue is disabled until the HP step records a choice.
    const cont = screen.getByRole("button", { name: /continue/i });
    expect(cont).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /take average/i }));
    expect(cont).toBeEnabled();
    await user.click(cont);

    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    // The placeholder can't satisfy the advancement step — Continue disables.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("Cancel returns to the sheet without submitting", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("SHEET")).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("Confirm on the last step submits and navigates to the sheet", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    await waitFor(() => expect(screen.getByText("SHEET")).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
    });
  });

  it("renders a rejected submission's error inline and stays in the ceremony", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockRejectedValue(new Error("this level-up requires choosing a subclass"));
    renderCeremony();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("this level-up requires choosing a subclass");
    expect(screen.queryByText("SHEET")).not.toBeInTheDocument();
  });

  it("scrolls the step body within a viewport-locked card, footer outside the scroller (#1171)", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    const scroller = document.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toContain("min-h-0");
    expect(scroller?.className).toContain("flex-1");
    const footer = screen.getByRole("button", { name: /cancel/i }).closest("footer");
    expect(scroller?.contains(footer)).toBe(false);
  });

  it("has no axe violations", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }]));
    const { container } = renderCeremony();
    await waitFor(() => expect(screen.getByText("Step 1 of 3")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});

// #1170: the class-choice front door replaces the sheet-side AddClassPanel —
// a multiclass-eligible character sees a chooser before the ceremony's rail.
describe("LevelUpCeremony — class choice (#1170)", () => {
  const rogueEligible = {
    ...character,
    abilityScores: { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  } as unknown as Character;

  it("shows the chooser first, gating the ineligible class, before the HP step", async () => {
    referenceMock.mockResolvedValue({
      races: [],
      backgrounds: [],
      alignments: [],
      artisanTools: [],
      classes: [
        {
          id: "cls-rogue",
          name: "Rogue",
          multiclassPrerequisite: { options: [{ dexterity: 13 }], description: "Dexterity 13" },
        },
        {
          id: "cls-wizard",
          name: "Wizard",
          multiclassPrerequisite: { options: [{ intelligence: 13 }], description: "Intelligence 13" },
        },
      ],
    } as unknown as ReferenceData);
    const user = userEvent.setup();
    renderCeremony({ character: rogueEligible });

    expect(await screen.findByRole("heading", { name: /which class levels up/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /fighter/i })).toBeEnabled();
    // New classes are collapsed behind the drill-in (#1209) — open it to reach them.
    expect(screen.queryByRole("radio", { name: "Rogue" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add a new class/i }));
    expect(screen.getByRole("radio", { name: "Rogue" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Wizard" })).toBeDisabled();
    expect(planMock).not.toHaveBeenCalled();
  });

  it("picking the new class and continuing enters that class's ceremony", async () => {
    referenceMock.mockResolvedValue({
      races: [],
      backgrounds: [],
      alignments: [],
      artisanTools: [],
      classes: [
        {
          id: "cls-rogue",
          name: "Rogue",
          multiclassPrerequisite: { options: [{ dexterity: 13 }], description: "Dexterity 13" },
        },
      ],
    } as unknown as ReferenceData);
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints" }, { kind: "review" }], {
        isPrimary: false,
        newLevel: 1,
        className: "Rogue",
        subclass: null,
      }),
    );
    const user = userEvent.setup();
    renderCeremony({ character: rogueEligible });

    await user.click(await screen.findByRole("button", { name: /add a new class/i }));
    await user.click(screen.getByRole("radio", { name: "Rogue" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(planMock).toHaveBeenCalledWith("c1", { kind: "new", classId: "cls-rogue" }, undefined),
    );
    expect(await screen.findByRole("heading", { name: /level.*0.*→.*1/i })).toBeInTheDocument();
    expect(screen.getByText("Rogue")).toBeInTheDocument();
  });

  it("Cancel on the chooser returns to the sheet without submitting", async () => {
    referenceMock.mockResolvedValue({
      races: [],
      backgrounds: [],
      alignments: [],
      artisanTools: [],
      classes: [
        {
          id: "cls-rogue",
          name: "Rogue",
          multiclassPrerequisite: { options: [{ dexterity: 13 }], description: "Dexterity 13" },
        },
      ],
    } as unknown as ReferenceData);
    const user = userEvent.setup();
    renderCeremony({ character: rogueEligible });

    await screen.findByRole("heading", { name: /which class levels up/i });
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("SHEET")).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });
});

// #1170: BG3-style per-level choice — Confirm on a level that leaves more
// pending offers "Level up again" instead of leaving the ceremony.
describe("LevelUpCeremony — level up again (#1170)", () => {
  it("shows the interstitial (not the sheet) when levels remain, and updates the character via onCharacterChange", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const onCharacterChange = vi.fn();
    const user = userEvent.setup();
    renderCeremony({ onCharacterChange });

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));

    expect(await screen.findByText(/level applied/i)).toBeInTheDocument();
    expect(screen.getByText(/one more advancement waiting/i)).toBeInTheDocument();
    expect(onCharacterChange).toHaveBeenCalledWith({ id: "c1", pendingLevelUps: 1 });
    expect(screen.queryByText("SHEET")).not.toBeInTheDocument();
  });

  it("'Level up again' re-enters the ceremony's first step with a clean draft", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));
    await screen.findByText(/level applied/i);

    planMock.mockClear();
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    await user.click(screen.getByRole("button", { name: /level up again/i }));

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    // Fresh draft — Continue is disabled again until HP is re-chosen.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("'Finish for now' returns to the sheet, keeping the level already applied", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const user = userEvent.setup();
    renderCeremony();

    await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /take average/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /confirm level up/i }));
    await screen.findByText(/level applied/i);

    await user.click(screen.getByRole("button", { name: /finish for now/i }));
    expect(await screen.findByText("SHEET")).toBeInTheDocument();
  });
});
