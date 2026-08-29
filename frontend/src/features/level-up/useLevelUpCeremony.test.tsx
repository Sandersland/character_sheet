import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { fetchLevelUpPlan, fetchReference, submitLevelUp } from "@/api/client";
import { useLevelUpCeremony } from "@/features/level-up/useLevelUpCeremony";
import { buildLevelUpLedger, type LedgerResolvers } from "@/lib/levelUpLedger";
import { cachedCharacter } from "@/test/renderWithCharacter";
import type { Character, LevelUpPlanResponse, LevelUpStep, ReferenceData } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchLevelUpPlan: vi.fn(), fetchReference: vi.fn(), submitLevelUp: vi.fn() }));

const planMock = vi.mocked(fetchLevelUpPlan);
const referenceMock = vi.mocked(fetchReference);
const submitMock = vi.mocked(submitLevelUp);

const EMPTY_REFERENCE = { races: [], classes: [], backgrounds: [], alignments: [], artisanTools: [] } as unknown as ReferenceData;

const character = {
  id: "c1",
  rulesEdition: "EDITION_2024",
  pendingLevelUps: 1,
  classes: [{ id: "entry-1", name: "fighter", level: 7, subclass: "Champion" }],
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
} as unknown as Character;

// #1380: this fixture is what the planner serves for a d10 class at Con 10.
const HP_META = { die: "d10", faces: 10, conMod: 0, fixedAverage: 6, averageGain: 6, minRoll: 1, maxRoll: 10 };

function plan(steps: LevelUpStep[], target?: Partial<LevelUpPlanResponse["target"]>): LevelUpPlanResponse {
  return {
    target: { className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true, ...target },
    steps,
    grantedSpells: [],
  };
}

const HP_ADV_REVIEW: LevelUpStep[] = [{ kind: "hitPoints", meta: HP_META }, { kind: "advancement", count: 1 }, { kind: "review" }];

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
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "subclass" }, { kind: "review" }], { subclass: null }));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.next());
    expect(result.current.currentStep?.kind).toBe("subclass");

    planMock.mockResolvedValue(
      plan(
        [
          { kind: "hitPoints", meta: HP_META },
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
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
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

  // #1323: dependentPicksBySubclass must never reach the wire — the endpoint strips unknown keys silently (no 400), so this frontend assertion is the only guard.
  it("strips ceremony-local draft state from the submitted body (#1323)", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1" } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() =>
      result.current.setDraft(() => ({
        hp: { method: "average" },
        maneuvers: [{ type: "learnManeuver", maneuverId: "m1" }],
        dependentPicksBySubclass: { bm: { maneuvers: [{ type: "learnManeuver", maneuverId: "m9" }] } },
      })),
    );
    act(() => result.current.next());
    await act(() => result.current.confirm());

    // Object.keys, not toHaveBeenCalledWith: vitest's argument matcher uses toEqual semantics, treating a present-but-undefined key as absent.
    const body = submitMock.mock.calls[0][1];
    expect(Object.keys(body)).not.toContain("dependentPicksBySubclass");
    expect(body.maneuvers).toEqual([{ type: "learnManeuver", maneuverId: "m1" }]);
  });

  it("honors ?classId= for a multiclass add — plans and submits {kind:'new'} (#1131)", async () => {
    planMock.mockResolvedValue(
      plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }], { isPrimary: false, newLevel: 1, className: "warlock" }),
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
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockRejectedValue(new Error("expected 1 advancement for this level-up, got 0"));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());
    // A mutation's error dispatch is notified via TanStack Query's internal batching (a microtask hop beyond confirm()'s own await), so this needs a tick.
    await waitFor(() =>
      expect(result.current.submitError).toBe("expected 1 advancement for this level-up, got 0"),
    );
  });
});

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
      plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }], { isPrimary: false, newLevel: 1, className: "Rogue" }),
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
    // Never resolves — 2 owned classes alone already answer "needs a choice"; the chooser must not block on the reference fetch to show that.
    referenceMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLevelUpCeremony(multiChar), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    expect(result.current.classChoice!.options.map((o) => o.name)).toEqual(["fighter", "wizard"]);
  });

  // decisionReady's referenceError arm exists so a failed reference fetch doesn't hang the ceremony forever — it degrades to existing-entries-only.
  it("auto-skips (doesn't hang) when the reference fetch fails, for a single-class character", async () => {
    referenceMock.mockRejectedValue(new Error("network error"));
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.classChoice).toBeNull();
    expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-1" }, undefined);
  });

  // An ineligible ?classId= deep link (prereq not met) must not be routed through just because it's the only deep-link candidate — the auto-skip path should land on the sole eligible option.
  it("ignores an ineligible ?classId= deep link, falling back to the sole eligible option", async () => {
    referenceWithClasses([
      {
        id: "cls-wizard",
        name: "Wizard",
        multiclassPrerequisite: { options: [{ intelligence: 13 }], description: "Intelligence 13" },
      },
    ]);
    planMock.mockResolvedValue(plan(HP_ADV_REVIEW));
    const { result } = renderHook(() => useLevelUpCeremony(character), {
      wrapper: makeWrapper("/characters/c1/level-up?classId=cls-wizard"),
    });

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.classChoice).toBeNull();
    expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-1" }, undefined);
    expect(planMock).not.toHaveBeenCalledWith("c1", { kind: "new", classId: "cls-wizard" }, undefined);
  });
});

describe("useLevelUpCeremony — level up again (#1170)", () => {
  it("shows the level-again interstitial instead of navigating away when levels remain", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());

    expect(cachedCharacter("c1")).toEqual({ id: "c1", pendingLevelUps: 1 });
    expect(result.current.levelAgain?.remaining).toBe(1);
  });

  it("does not show the interstitial and calls onDone-equivalent (navigates) when nothing is left pending", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 0 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());

    expect(result.current.levelAgain).toBeNull();
  });

  it("'Level up again' resets the draft and re-triggers a fresh plan fetch for the next level", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());
    expect(result.current.levelAgain).not.toBeNull();

    planMock.mockClear();
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    act(() => result.current.levelAgain!.onContinue());

    expect(result.current.levelAgain).toBeNull();
    expect(result.current.draft).toEqual({});
    await waitFor(() => expect(planMock).toHaveBeenCalledTimes(1));
  });

  it("re-enters the class chooser after 'Level up again' for a multiclassed character", async () => {
    const multiChar = {
      ...character,
      classes: [
        { id: "entry-1", name: "fighter", level: 7 },
        { id: "entry-2", name: "wizard", level: 3 },
      ],
    } as unknown as Character;
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(multiChar), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    act(() => result.current.classChoice!.onChoose({ kind: "existing", classEntryId: "entry-1" }));
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setDraft((d) => ({ ...d, hp: { method: "average" } })));
    await act(() => result.current.confirm());
    expect(result.current.levelAgain).not.toBeNull();

    planMock.mockClear();
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "review" }]));
    act(() => result.current.levelAgain!.onContinue());

    expect(result.current.classChoice).not.toBeNull();
    expect(planMock).not.toHaveBeenCalled();

    act(() => result.current.classChoice!.onChoose({ kind: "existing", classEntryId: "entry-2" }));

    expect(result.current.classChoice).toBeNull();
    await waitFor(() =>
      expect(planMock).toHaveBeenCalledWith("c1", { kind: "existing", classEntryId: "entry-2" }, undefined),
    );
  });
});

// #1421: a subclass switch away from Eldritch Knight retires the newSpells step, but spellsLearned/cantripsLearned/spellsForgotten survive in the draft unless pruned — leaving a dead-end Review screen and a 400 on confirm.
describe("useLevelUpCeremony — pruning the draft to the served plan (#1421)", () => {
  // Needs a real spellbook entry so the Forgotten-row ledger assertion (test 3) resolves a name rather than covering nothing.
  const wizardFighter = {
    id: "c1",
    rulesEdition: "EDITION_2024",
    pendingLevelUps: 1,
    level: 8,
    hitPoints: { max: 44 },
    hitDice: { total: 7, die: "d6" },
    classes: [
      { id: "entry-wiz", name: "wizard", level: 5 },
      { id: "entry-ftr", name: "fighter", level: 2 },
    ],
    abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 8 },
    spellcasting: { slots: [], arcana: [], spells: [{ id: "k-charm", name: "Charm Person", level: 1 }] },
  } as unknown as Character;

  const EK_STEPS: LevelUpStep[] = [
    { kind: "hitPoints", meta: HP_META },
    { kind: "subclass" },
    { kind: "newSpells", count: 3, meta: { maxSpellLevel: 1, canSwap: true, cantrips: 2 } },
    { kind: "review" },
  ];
  const CHAMPION_STEPS: LevelUpStep[] = [{ kind: "hitPoints", meta: HP_META }, { kind: "subclass" }, { kind: "review" }];

  const LEDGER_RESOLVERS: LedgerResolvers = {
    maneuver: () => undefined,
    spell: (id) =>
      ({ s1: "Fire Bolt", s2: "Shield", s3: "Absorb Elements", c1: "Booming Blade", c2: "Green-Flame Blade" })[id],
    feat: () => undefined,
  };

  async function setupWithStagedSpells() {
    planMock.mockResolvedValue(plan(EK_STEPS, { className: "fighter", newLevel: 3, subclass: "Eldritch Knight" }));
    const { result } = renderHook(() => useLevelUpCeremony(wizardFighter), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.classChoice).not.toBeNull());
    act(() => result.current.classChoice!.onChoose({ kind: "existing", classEntryId: "entry-ftr" }));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Eldritch Knight"));

    act(() =>
      result.current.setDraft((d) => ({
        ...d,
        hp: { method: "average" },
        subclassId: "sub-ek",
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }, { type: "learnSpell", spellId: "s2" }],
        cantripsLearned: [{ type: "learnSpell", spellId: "c1" }, { type: "learnSpell", spellId: "c2" }],
        spellsForgotten: [{ type: "forgetSpell", entryId: "k-charm" }],
      })),
    );

    return result;
  }

  it("drops the spell picks when a subclass switch retires the newSpells step", async () => {
    const result = await setupWithStagedSpells();
    // Vacuity guard: prove the picks were actually staged before the switch.
    expect(result.current.draft.spellsLearned).toHaveLength(2);

    planMock.mockResolvedValue(plan(CHAMPION_STEPS, { className: "fighter", newLevel: 3, subclass: "Champion" }));
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-champion" })));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Champion"));

    expect(result.current.draft.spellsLearned).toBeUndefined();
    expect(result.current.draft.cantripsLearned).toBeUndefined();
    expect(result.current.draft.spellsForgotten).toBeUndefined();
  });

  it("confirm posts a body with none of the retired spell fields", async () => {
    const result = await setupWithStagedSpells();
    planMock.mockResolvedValue(plan(CHAMPION_STEPS, { className: "fighter", newLevel: 3, subclass: "Champion" }));
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-champion" })));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Champion"));

    submitMock.mockResolvedValue({ id: "c1" } as Character);
    await act(() => result.current.confirm());

    const body = submitMock.mock.calls[0][1];
    expect(Object.keys(body)).not.toContain("spellsLearned");
    expect(Object.keys(body)).not.toContain("cantripsLearned");
    expect(Object.keys(body)).not.toContain("spellsForgotten");
  });

  it("the Review ledger shows no New Spells, New Cantrips or Forgotten row after the switch", async () => {
    const result = await setupWithStagedSpells();
    planMock.mockResolvedValue(plan(CHAMPION_STEPS, { className: "fighter", newLevel: 3, subclass: "Champion" }));
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-champion" })));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Champion"));

    const rows = buildLevelUpLedger(wizardFighter, result.current.draft, result.current.plan!, LEDGER_RESOLVERS);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Level"); // vacuity guard: the ledger call itself works.
    expect(labels).not.toContain("New Spells");
    expect(labels).not.toContain("New Cantrips");
    expect(labels).not.toContain("Forgotten");
  });

  it("switching back to Eldritch Knight requires re-picking the spells (#1323 stashes subclass-dependent picks, not class-driven ones)", async () => {
    const result = await setupWithStagedSpells();
    planMock.mockResolvedValue(plan(CHAMPION_STEPS, { className: "fighter", newLevel: 3, subclass: "Champion" }));
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-champion" })));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Champion"));

    planMock.mockResolvedValue(plan(EK_STEPS, { className: "fighter", newLevel: 3, subclass: "Eldritch Knight" }));
    act(() => result.current.setDraft((d) => ({ ...d, subclassId: "sub-ek" })));
    await waitFor(() => expect(result.current.plan?.target.subclass).toBe("Eldritch Knight"));

    expect(result.current.draft.spellsLearned).toBeUndefined();
  });
});

// #1421: useLevelUpPlan sets plan to null while the class-chooser/level-again interstitial own the screen (its `skip`), and useLevelUpCeremony falls back to `plan?.steps ?? []` — pruning against that empty fallback would wipe the entire draft mid-ceremony.
describe("useLevelUpCeremony — never prune before a plan has arrived (#1421)", () => {
  const multiChar = {
    ...character,
    classes: [
      { id: "entry-1", name: "fighter", level: 7 },
      { id: "entry-2", name: "wizard", level: 3 },
    ],
  } as unknown as Character;

  // This test is green before and after the guard (plan never becomes non-null while the chooser owns the screen) — kept to catch a future refactor to a steps-keyed effect; the level-again test below is the real driver.
  it("does not prune while the class chooser owns the screen (no plan has arrived)", async () => {
    const { result } = renderHook(() => useLevelUpCeremony(multiChar), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.classChoice).not.toBeNull());

    act(() =>
      result.current.setDraft(() => ({
        hp: { method: "average" },
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      })),
    );

    expect(result.current.draft.spellsLearned).toEqual([{ type: "learnSpell", spellId: "s1" }]);
  });

  it("does not prune while the level-again interstitial owns the screen", async () => {
    planMock.mockResolvedValue(plan([{ kind: "hitPoints", meta: HP_META }, { kind: "newSpells", count: 1 }, { kind: "review" }]));
    submitMock.mockResolvedValue({ id: "c1", pendingLevelUps: 1 } as Character);
    const { result } = renderHook(() => useLevelUpCeremony(character), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() =>
      result.current.setDraft(() => ({
        hp: { method: "average" },
        spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
      })),
    );
    await act(() => result.current.confirm());
    expect(result.current.levelAgain).not.toBeNull();

    // The submit flips skipPlan true → useLevelUpPlan sets plan to null → the [plan] effect fires again — proving the guard, not just its absence of a crash.
    expect(result.current.draft.spellsLearned).toEqual([{ type: "learnSpell", spellId: "s1" }]);
  });
});
