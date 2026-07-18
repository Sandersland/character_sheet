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
