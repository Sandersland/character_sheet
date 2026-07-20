import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDisciplines, fetchFeats, fetchManeuvers, fetchReference } from "@/api/client";
import ChoiceStep from "@/features/level-up/ChoiceStep";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import { axe } from "@/test/axe";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchManeuvers: vi.fn(),
  fetchDisciplines: vi.fn(),
  fetchReference: vi.fn(),
  fetchFeats: vi.fn(),
}));

// Defaults restored per-test so a test's mockResolvedValue override can't leak.
beforeEach(() => {
  vi.mocked(fetchManeuvers).mockResolvedValue([
    { id: "m1", name: "Riposte", description: "riposte" },
    { id: "m2", name: "Trip Attack", description: "trip" },
    { id: "m3", name: "Menacing Attack", description: "menace" },
  ]);
  vi.mocked(fetchDisciplines).mockResolvedValue([]);
  vi.mocked(fetchReference).mockResolvedValue({ artisanTools: [] } as unknown as Awaited<
    ReturnType<typeof fetchReference>
  >);
  vi.mocked(fetchFeats).mockResolvedValue([
    { id: "archery", name: "Archery", description: "arch", category: "fighting_style" },
    { id: "defense", name: "Defense", description: "def", category: "fighting_style" },
    { id: "sentinel", name: "Sentinel", description: "sent", category: "general" },
  ] as unknown as Awaited<ReturnType<typeof fetchFeats>>);
});

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: "Battle Master", newLevel: 3, isPrimary: true },
  steps: [],
  grantedSpells: [],
};

function Harness({
  step,
  character,
  plan: planOverride,
}: {
  step: LevelUpStep;
  character?: Character;
  plan?: LevelUpPlanResponse;
}) {
  const [draft, setDraft] = useState<LevelUpDraft>({ hp: { method: "average" } });
  return (
    <LevelUpStepContext.Provider
      value={{
        character: character ?? ({ resources: {}, advancements: [] } as unknown as Character),
        draft,
        setDraft,
        plan: planOverride ?? plan,
      }}
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

  it("single-selects a fighting-style feat as a takeFeat op and replaces on re-pick", async () => {
    const user = userEvent.setup();
    render(<Harness step={{ kind: "fightingStyleFeat" }} />);

    await user.click(await screen.findByText("Archery"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft").textContent!).fightingStyleFeat).toEqual({
        type: "takeFeat",
        featId: "archery",
        slot: "fightingStyle",
      });
    });

    await user.click(screen.getByText("Defense"));
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft").textContent!).fightingStyleFeat).toEqual({
        type: "takeFeat",
        featId: "defense",
        slot: "fightingStyle",
      });
    });
  });

  // Discipline options are gated by the ceremony's TARGET level (post-level-up),
  // not the character's current level — regression #1174.
  it("gates disciplines by the plan's target level, hiding higher-gate and alwaysKnown options", async () => {
    vi.mocked(fetchDisciplines).mockResolvedValue([
      { id: "elemental-attunement", name: "Elemental Attunement", description: "attune", minLevel: 3, alwaysKnown: true },
      { id: "fangs-of-the-fire-snake", name: "Fangs of the Fire Snake", description: "fire", minLevel: 3, alwaysKnown: false },
      { id: "ride-the-wind", name: "Ride the Wind", description: "fly", minLevel: 6, alwaysKnown: false },
    ] as unknown as Awaited<ReturnType<typeof fetchDisciplines>>);
    const character = { level: 2, resources: {}, advancements: [] } as unknown as Character;
    const targetPlan: LevelUpPlanResponse = {
      target: { className: "Monk", subclass: "Way of the Four Elements", newLevel: 3, isPrimary: true },
      steps: [],
      grantedSpells: [],
    };

    render(<Harness step={{ kind: "disciplines", count: 2 }} character={character} plan={targetPlan} />);

    expect(await screen.findByText("Fangs of the Fire Snake")).toBeInTheDocument();
    expect(screen.queryByText("Ride the Wind")).not.toBeInTheDocument();
    expect(screen.queryByText("Elemental Attunement")).not.toBeInTheDocument();
  });

  it("includes a higher-gate discipline once the plan's target level reaches it", async () => {
    vi.mocked(fetchDisciplines).mockResolvedValue([
      { id: "elemental-attunement", name: "Elemental Attunement", description: "attune", minLevel: 3, alwaysKnown: true },
      { id: "fangs-of-the-fire-snake", name: "Fangs of the Fire Snake", description: "fire", minLevel: 3, alwaysKnown: false },
      { id: "ride-the-wind", name: "Ride the Wind", description: "fly", minLevel: 6, alwaysKnown: false },
    ] as unknown as Awaited<ReturnType<typeof fetchDisciplines>>);
    const character = { level: 5, resources: {}, advancements: [] } as unknown as Character;
    const targetPlan: LevelUpPlanResponse = {
      target: { className: "Monk", subclass: "Way of the Four Elements", newLevel: 6, isPrimary: true },
      steps: [],
      grantedSpells: [],
    };

    render(<Harness step={{ kind: "disciplines", count: 2 }} character={character} plan={targetPlan} />);

    expect(await screen.findByText("Ride the Wind")).toBeInTheDocument();
  });

  it("has no axe violations once loaded", async () => {
    const { container } = render(<Harness step={{ kind: "maneuvers", count: 2 }} />);
    await screen.findByText("Riposte");
    expect(await axe(container)).toHaveNoViolations();
  });

  // STEP_BODIES maps several kinds to the same ChoiceStep; navigating between two
  // adjacent choice steps re-renders the SAME instance with a new step.kind, which
  // must refetch that kind's catalog (regression: a fetch-once guard stranded it).
  it("refetches for the new kind when the same instance is reused (maneuvers → toolProficiency)", async () => {
    vi.mocked(fetchReference).mockResolvedValue({
      artisanTools: [{ name: "Smith's Tools" }, { name: "Brewer's Supplies" }],
    } as Awaited<ReturnType<typeof fetchReference>>);

    const { rerender } = render(<Harness step={{ kind: "maneuvers", count: 2 }} />);
    expect(await screen.findByText("Riposte")).toBeInTheDocument();

    rerender(<Harness step={{ kind: "toolProficiency", count: 1 }} />);

    expect(await screen.findByText("Smith's Tools")).toBeInTheDocument();
    expect(screen.getByText("Brewer's Supplies")).toBeInTheDocument();
    // The prior kind's options must be gone, not lingering as stale rows.
    expect(screen.queryByText("Riposte")).not.toBeInTheDocument();
  });

  // The reused instance also holds the filter text; a filter typed on one kind
  // must not survive to hide the next kind's options (comment 3609483577).
  it("resets the search filter when the reused instance switches kind", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchManeuvers).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `Maneuver ${i}`, description: "d" })),
    );
    vi.mocked(fetchReference).mockResolvedValue({
      artisanTools: Array.from({ length: 10 }, (_, i) => ({ name: `Tool ${i}` })),
    } as Awaited<ReturnType<typeof fetchReference>>);

    const { rerender } = render(<Harness step={{ kind: "maneuvers", count: 2 }} />);
    const box = await screen.findByRole("searchbox");
    await user.type(box, "Maneuver 3");
    await waitFor(() => expect(box).toHaveValue("Maneuver 3"));

    rerender(<Harness step={{ kind: "toolProficiency", count: 1 }} />);

    // Every tool is visible — a stale "Maneuver 3" filter would hide them all.
    expect(await screen.findByText("Tool 0")).toBeInTheDocument();
    expect(screen.getByText("Tool 9")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("loads options under StrictMode's double-invoked effects", async () => {
    render(
      <StrictMode>
        <Harness step={{ kind: "maneuvers", count: 2 }} />
      </StrictMode>,
    );

    expect(await screen.findByText("Riposte")).toBeInTheDocument();
  });
});
