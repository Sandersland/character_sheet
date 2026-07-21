import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference, submitLevelUp } from "@/api/client";
import { useLevelUpCeremony } from "@/features/level-up/useLevelUpCeremony";
import type { Character, LevelUpPlanResponse, LevelUpStep, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchLevelUpPlan: vi.fn(), fetchReference: vi.fn(), submitLevelUp: vi.fn() }));

const planMock = vi.mocked(fetchLevelUpPlan);
const referenceMock = vi.mocked(fetchReference);
const submitMock = vi.mocked(submitLevelUp);

const EMPTY_REFERENCE = { races: [], classes: [], backgrounds: [], alignments: [], artisanTools: [] } as unknown as ReferenceData;

const character = {
  id: "c1",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
} as unknown as Character;

function plan(steps: LevelUpStep[], target?: Partial<LevelUpPlanResponse["target"]>): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true, ...target },
    steps,
    grantedSpells: [],
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
  referenceMock.mockResolvedValue(EMPTY_REFERENCE);
});

describe("useLevelUpCeremony", () => {
  it("fetches the plan for the primary entry and starts on the first step", async () => {
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-1" }, undefined);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep?.kind).toBe("hitPoints");
    // The draft starts empty — the HP step (#887) must record a choice before Continue arms.
    expect(result.current.canContinue).toBe(false);
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

  it("confirm submits exactly { target, ...draft }", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    act(() => result.current.next());
    expect(result.current.isLast).toBe(true);
    await act(() => result.current.confirm());

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "existing", classEntryId: "entry-1" },
      hp: { method: "average" },
    });
  });

  it("honors ?classId= for a multiclass add — plans and submits {kind:'new'} (#1131)", async () => {
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints" }, { kind: "review" }], { isPrimary: false, newLevel: 1, className: "warlock" }),
    );
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), {
      wrapper: makeWrapper("/characters/c1/level-up?classId=class-warlock"),
    });

    await waitFor(() =>
      expect(planMock).toHaveBeenCalledWith("c1", { kind: "new", classId: "class-warlock" }, undefined),
    );

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());

    expect(submitMock).toHaveBeenCalledWith("c1", {
      target: { kind: "new", classId: "class-warlock" },
      hp: { method: "average" },
    });
  });

  it("surfaces a submit failure as submitError", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockRejectedValue(new Error("expected 1 advancement for this level-up, got 0"));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());
    expect(result.current.submitError).toBe("expected 1 advancement for this level-up, got 0");
  });
});

// #1170: the front door — a class-choice step at ceremony start when the
// character can advance more than one class (existing entries + eligible new
// classes), replacing the sheet-side AddClassPanel dropdown.
describe("useLevelUpCeremony — class choice (#1170)", () => {
  const rogueEligibleCharacter = {
    ...character,
    abilityScores: { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  } as unknown as Character;

  function referenceWithClasses(classes: unknown[]) {
    referenceMock.mockResolvedValue({ ...EMPTY_REFERENCE, classes } as unknown as ReferenceData);
  }

  it("shows owned + eligible-new classes, gating an ineligible new class, before ever fetching a plan", async () => {
    referenceWithClasses([
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
    ]);
    const { result } = renderHook(() => useLevelUpCeremony(rogueEligibleCharacter), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    expect(planMock).not.toHaveBeenCalled();
    expect(result.current.classChoice!.options.map((o) => o.name)).toEqual([
      "fighter (Champion)",
      "Rogue",
      "Wizard",
    ]);
    expect(result.current.classChoice!.options.find((o) => o.name === "Rogue")).toMatchObject({ eligible: true });
    expect(result.current.classChoice!.options.find((o) => o.name === "Wizard")).toMatchObject({
      eligible: false,
      requirement: "Intelligence 13",
    });
  });

  it("routes the plan fetch to whichever target the chooser picks", async () => {
    referenceWithClasses([
      {
        id: "cls-rogue",
        name: "Rogue",
        multiclassPrerequisite: { options: [{ dexterity: 13 }], description: "Dexterity 13" },
      },
    ]);
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints" }, { kind: "review" }], { isPrimary: false, newLevel: 1, className: "Rogue" }),
    );
    const { result } = renderHook(() => useLevelUpCeremony(rogueEligibleCharacter), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.classChoice).not.toBeNull());

    act(() => result.current.classChoice!.onChoose({ kind: "new", classId: "cls-rogue" }));

    await waitFor(() =>
      expect(planMock).toHaveBeenCalledWith("c1", { kind: "new", classId: "cls-rogue" }, undefined),
    );
    expect(result.current.classChoice).toBeNull();
  });

  it("preselects the ?entry= deep link as the chooser's initial target", async () => {
    const multiChar = {
      ...rogueEligibleCharacter,
      classes: [
        { id: "entry-1", name: "fighter", level: 7 },
        { id: "entry-2", name: "wizard", level: 3 },
      ],
    } as unknown as Character;
    const { result } = renderHook(() => useLevelUpCeremony(multiChar), {
      wrapper: makeWrapper("/characters/c1/level-up?entry=entry-2"),
    });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    expect(result.current.classChoice!.initialTarget).toEqual({ kind: "existing", classEntryId: "entry-2" });
  });

  it("auto-skips the chooser for a single class with no eligible multiclass (unchanged one-click flow)", async () => {
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.classChoice).toBeNull();
  });

  it("shows the chooser for an already-multiclassed character without waiting on reference", async () => {
    const multiChar = {
      ...character,
      classes: [
        { id: "entry-1", name: "fighter", level: 7 },
        { id: "entry-2", name: "wizard", level: 3 },
      ],
    } as unknown as Character;
    // Never resolves — 2 owned classes alone already answer "needs a choice";
    // the chooser must not block on the reference fetch to show that.
    referenceMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLevelUpCeremony(multiChar), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    expect(result.current.classChoice!.options.map((o) => o.name)).toEqual(["fighter", "wizard"]);
  });
});

// #1170: BG3-style per-level choice — Confirm loops back to the chooser instead
// of leaving the ceremony while pendingLevelUps remain.
describe("useLevelUpCeremony — level up again (#1170)", () => {
  it("shows the level-again interstitial instead of navigating away when levels remain", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const onCharacterChange = vi.fn();
    const { result } = renderHook(() => useLevelUpCeremony(character, onCharacterChange), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());

    expect(onCharacterChange).toHaveBeenCalledWith({ id: "c1", pendingLevelUps: 1 });
    expect(result.current.levelAgain?.remaining).toBe(1);
  });

  it("does not show the interstitial and calls onDone-equivalent (navigates) when nothing is left pending", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 0 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());

    expect(result.current.levelAgain).toBeNull();
  });

  it("'Level up again' resets the draft and re-triggers a fresh plan fetch for the next level", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());
    expect(result.current.levelAgain).not.toBeNull();

    planMock.mockClear();
    planMock.mockResolvedValue(plan([{ kind: "hitPoints" }, { kind: "review" }]));
    act(() => result.current.levelAgain!.onContinue());

    expect(result.current.levelAgain).toBeNull();
    expect(result.current.draft).toEqual({});
    await waitFor(() => expect(planMock).toHaveBeenCalledTimes(1));
  });
});
