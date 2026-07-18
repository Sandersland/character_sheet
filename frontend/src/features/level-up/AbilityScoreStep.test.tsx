import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeats } from "@/api/client";
import AbilityScoreStep from "@/features/level-up/AbilityScoreStep";
import { LevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { axe } from "@/test/axe";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { CatalogFeat, Character, LevelUpPlanResponse } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchFeats: vi.fn() }));
const feats = vi.mocked(fetchFeats);

const CATALOG: CatalogFeat[] = [
  { id: "alert", name: "Alert", description: "Always on guard.", abilityOptions: [], abilityIncrease: 0, improvements: [] },
  {
    id: "resilient",
    name: "Resilient",
    description: "Gain proficiency in a save.",
    abilityOptions: ["strength", "dexterity", "constitution"],
    abilityIncrease: 1,
    improvements: [],
  },
];

const character = {
  id: "c1",
  abilityScores: { strength: 19, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 8 },
  skills: [
    { name: "athletics", ability: "strength", proficient: true },
    { name: "stealth", ability: "dexterity", proficient: false },
  ],
} as unknown as Character;

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: null, newLevel: 8, isPrimary: true },
  steps: [{ kind: "advancement", count: 1 }, { kind: "review" }],
};

function renderStep(draft: LevelUpDraft = {} as LevelUpDraft) {
  const setDraft = vi.fn();
  const utils = render(
    <LevelUpStepContext.Provider value={{ character, draft, setDraft, plan }}>
      <AbilityScoreStep />
    </LevelUpStepContext.Provider>,
  );
  return { setDraft, ...utils };
}

/** Resolve setDraft's functional-update calls against a starting draft. */
function applied(setDraft: ReturnType<typeof vi.fn>, from: LevelUpDraft = {} as LevelUpDraft): LevelUpDraft {
  return setDraft.mock.calls.reduce<LevelUpDraft>((d, [update]) => (typeof update === "function" ? update(d) : update), from);
}

beforeEach(() => {
  vi.clearAllMocks();
  feats.mockResolvedValue(CATALOG);
});

describe("AbilityScoreStep — scaffold + branch toggle", () => {
  it("offers both branches and defaults to the ability-score branch", () => {
    renderStep();
    expect(screen.getByRole("button", { name: /improve ability scores/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take a feat/i })).toBeInTheDocument();
    // ASI body is the default — the point counter is visible, no feat filter yet.
    expect(screen.getByText(/remaining/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/filter feats/i)).not.toBeInTheDocument();
  });

  it("swaps to the feat body and clears any staged advancement when switching", async () => {
    const user = userEvent.setup();
    const staged: LevelUpDraft = { advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] } } as LevelUpDraft;
    const { setDraft } = renderStep(staged);

    await user.click(screen.getByRole("button", { name: /take a feat/i }));

    expect(await screen.findByPlaceholderText(/filter feats/i)).toBeInTheDocument();
    expect(applied(setDraft, staged).advancement).toBeUndefined();
  });

  it("has no axe violations in either branch", async () => {
    const user = userEvent.setup();
    const { container } = renderStep();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: /take a feat/i }));
    await screen.findByPlaceholderText(/filter feats/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AbilityScoreStep — ASI branch", () => {
  it("stages a +2 takeAsi op and shows 0 remaining after two points", async () => {
    const user = userEvent.setup();
    const { setDraft } = renderStep();

    await user.click(screen.getByRole("button", { name: /increase constitution/i }));
    await user.click(screen.getByRole("button", { name: /increase constitution/i }));

    expect(screen.getByText(/0 remaining/i)).toBeInTheDocument();
    expect(applied(setDraft).advancement).toEqual({
      type: "takeAsi",
      increases: [{ ability: "constitution", amount: 2 }],
    });
  });

  it("caps a single ability at 20, disabling its further increase (start 19)", async () => {
    const user = userEvent.setup();
    renderStep();

    const bump = screen.getByRole("button", { name: /increase strength/i });
    await user.click(bump);

    expect(screen.getByText(/→ 20/)).toBeInTheDocument();
    expect(bump).toBeDisabled();
    expect(screen.getByText(/1 remaining/i)).toBeInTheDocument();
  });

  it("stages a 1/1 split summing to two", async () => {
    const user = userEvent.setup();
    const { setDraft } = renderStep();

    await user.click(screen.getByRole("button", { name: /increase constitution/i }));
    await user.click(screen.getByRole("button", { name: /increase wisdom/i }));

    const op = applied(setDraft).advancement;
    expect(op).toMatchObject({ type: "takeAsi" });
    const increases = (op as { increases: unknown[] }).increases;
    expect(increases).toHaveLength(2);
    expect(increases).toEqual(
      expect.arrayContaining([
        { ability: "constitution", amount: 1 },
        { ability: "wisdom", amount: 1 },
      ]),
    );
  });

  it("clears the staged op when points drop below two", async () => {
    const user = userEvent.setup();
    const { setDraft } = renderStep();

    await user.click(screen.getByRole("button", { name: /increase constitution/i }));
    await user.click(screen.getByRole("button", { name: /increase constitution/i }));
    await user.click(screen.getByRole("button", { name: /decrease constitution/i }));

    expect(applied(setDraft).advancement).toBeUndefined();
  });
});
