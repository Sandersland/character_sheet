import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, submitLevelUp } from "@/api/client";
import { useLevelUpCeremony } from "@/features/level-up/useLevelUpCeremony";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchLevelUpPlan: vi.fn(), submitLevelUp: vi.fn() }));

const planMock = vi.mocked(fetchLevelUpPlan);
const submitMock = vi.mocked(submitLevelUp);

const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
} as unknown as Character;

function plan(steps: LevelUpStep[], target?: Partial<LevelUpPlanResponse["target"]>): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true, ...target },
    steps,
  };
}

const HP_ADV_REVIEW: LevelUpStep[] = [{ kind: "hitPoints" }, { kind: "advancement", count: 1 }, { kind: "review" }];

function makeWrapper(url = "/characters/c1/level-up") {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/characters/:id/level-up" element={children} />
          <Route path="/characters/:id" element={<div>SHEET</div>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLevelUpCeremony", () => {
  it("fetches the plan for the primary entry and starts on the first step", async () => {
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-1" }, undefined);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep?.kind).toBe("hitPoints");
    // Seeded hp draft satisfies the first step, so Continue is armed.
    expect(result.current.canContinue).toBe(true);
  });

  it("honors the ?entry= override for the target entry", async () => {
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    renderHook(() => useLevelUpCeremony(character), {
      wrapper: makeWrapper("/characters/c1/level-up?entry=entry-2"),
    });

    await waitFor(() =>
      expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-2" }, undefined),
    );
  });

  it("keeps the draft across back/continue", async () => {
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    const asi = { type: "takeAsi" as const, increases: [{ ability: "strength", amount: 2 as const }] };
    act(() => result.current.setDraft((d) => ({ ...d, advancement: asi })));
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.draft.advancement).toEqual(asi);
  });

  it("tracks position by stepKey so a subclass re-plan doesn't move the user", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }], { subclass: null }));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.next());
    expect(result.current.currentStep?.kind).toBe("subclass");

    // The subclass pick triggers a refetch that inserts new steps after it.
    planMock.mockResolvedValue(
      plan(
        [
          { kind: "hitPoints" },
          { kind: "subclass" },
          { kind: "maneuvers", count: 3 },
          { kind: "toolProficiency", count: 1 },
          { kind: "review" },
        ],
        { subclass: "Battle Master" },
      ),
    );
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-1" })));

    await waitFor(() => expect(result.current.steps).toHaveLength(5));
    expect(planMock).toHaveBeenLastCalledWith("c1", { kind: "existing", classEntryId: "entry-1" }, "sub-1");
    expect(result.current.currentStep?.kind).toBe("subclass");
    expect(result.current.stepIndex).toBe(1);
  });

  it("flags a non-primary plan containing subclass/fightingStyle steps as blocked (#1065)", async () => {
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }], { isPrimary: false, subclass: null }),
    );
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.blocked).toBe(true);
  });

  it("does not block a non-primary plan without those steps", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }], { isPrimary: false }));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.blocked).toBe(false);
  });

  it("confirm submits exactly { target, ...draft }", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.next());
    expect(result.current.isLast).toBe(true);
    await act(() => result.current.confirm());

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
    });
  });

  it("surfaces a submit failure as submitError", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockRejectedValue(new Error("expected 1 advancement for this level-up, got 0"));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    await act(() => result.current.confirm());
    expect(result.current.submitError).toBe("expected 1 advancement for this level-up, got 0");
  });
});
