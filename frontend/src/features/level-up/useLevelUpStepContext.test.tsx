import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LevelUpStepContext, useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse } from "@/types/character";

const plan: LevelUpPlanResponse = {
  target: { className: "Fighter", subclass: null, newLevel: 8, isPrimary: true },
  steps: [{ kind: "hitPoints" }, { kind: "review" }],
  grantedSpells: [],
};

function Probe() {
  const ctx = useLevelUpStepContext();
  return (
    <p>
      {ctx.character.id}:{ctx.draft.hp?.method ?? "unset"}:{ctx.plan.target.className}
    </p>
  );
}

describe("useLevelUpStepContext", () => {
  it("throws when used outside the ceremony provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/level-up ceremony/i);
    vi.restoreAllMocks();
  });

  it("exposes character, draft, setDraft, and plan inside the provider", () => {
    const setDraft = vi.fn();
    const draft: LevelUpDraft = { hp: { method: "average" } };
    const target = { kind: "existing", classEntryId: "entry-1" } as const;
    render(
      <LevelUpStepContext.Provider value={{ character: { id: "c1" } as Character, draft, setDraft, plan, target }}>
        <Probe />
      </LevelUpStepContext.Provider>,
    );
    expect(screen.getByText("c1:average:Fighter")).toBeInTheDocument();
  });
});
