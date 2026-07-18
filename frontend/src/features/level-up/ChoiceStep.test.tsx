import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import ChoiceStep from "@/features/level-up/ChoiceStep";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import { axe } from "@/test/axe";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchManeuvers: vi.fn(async () => [
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
    { id: "m3", name: "Menacing Attack", description: "menace" },
  ]),
  fetchDisciplines: vi.fn(async () => []),
  fetchReference: vi.fn(async () => ({ artisanTools: [] })),
}));

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: "Battle Master", newLevel: 3, isPrimary: true },
  steps: [],
};

function Harness({ step, character }: { step: LevelUpStep; character?: Character }) {
  const [draft, setDraft] = useState<LevelUpDraft>({ hp: { method: "average" } });
  return (
    <LevelUpStepContext.Provider
      value={{ character: character ?? ({ resources: {} } as Character), draft, setDraft, plan }}
    >
      <ChoiceStep step={step} />
      <pre data-testid="draft">{JSON.stringify(draft)}</pre>
    </LevelUpStepContext.Provider>
  );
}

describe("ChoiceStep", () => {
  it("renders the fetched maneuver catalog minus already-known", async () => {
    const character = {
      resources: { maneuversKnown: [{ id: "e1", maneuverId: "m2", name: "Trip Attack", description: "" }] },
    } as Character;
    render(<Harness step={{ kind: "maneuvers", count: 2 }} character={character} />);

    expect(await screen.findByText("Riposte")).toBeInTheDocument();
    expect(screen.getByText("Menacing Attack")).toBeInTheDocument();
    expect(screen.queryByText("Trip Attack")).not.toBeInTheDocument();
  });

  it("pushes a learnManeuver op when an option is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness step={{ kind: "maneuvers", count: 2 }} />);

    await user.click(await screen.findByText("Riposte"));
    await waitFor(() => {
      const draft = JSON.parse(screen.getByTestId("draft").textContent!);
      expect(draft.maneuvers).toEqual([{ type: "learnManeuver", maneuverId: "m1" }]);
    });
  });

  it("blocks an (N+1)th pick once the count is met", async () => {
    const user = userEvent.setup();
    render(<Harness step={{ kind: "maneuvers", count: 2 }} />);

    await user.click(await screen.findByText("Riposte"));
    await user.click(screen.getByText("Trip Attack"));

    const third = screen.getByText("Menacing Attack").closest("button")!;
    expect(third).toBeDisabled();

    await user.click(third);
    const draft = JSON.parse(screen.getByTestId("draft").textContent!);
    expect(draft.maneuvers).toHaveLength(2);
  });

  it("single-selects a fighting style as a scalar and replaces on re-pick", async () => {
    const user = userEvent.setup();
    render(<Harness step={{ kind: "fightingStyle" }} />);

    await user.click(await screen.findByText("Archery"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft").textContent!).fightingStyle).toBe("archery");
    });

    await user.click(screen.getByText("Defense"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft").textContent!).fightingStyle).toBe("defense");
    });
  });

  it("has no axe violations once loaded", async () => {
    const { container } = render(<Harness step={{ kind: "maneuvers", count: 2 }} />);
    await screen.findByText("Riposte");
    expect(await axe(container)).toHaveNoViolations();
  });
});
