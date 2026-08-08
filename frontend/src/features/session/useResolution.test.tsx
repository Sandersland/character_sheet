import type { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { RollProvider } from "@/features/dice/RollContext";
import { useResolution, type ResolutionRolls, type ResolutionTurnState } from "@/features/session/useResolution";
import type { RollMode } from "@/lib/dice";
import type { RollModifier } from "@/types/character";
import type { TurnResolution } from "@character-sheet/shared-types";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

// Deterministic dice: rollDie picks `1 + floor(random * faces)`. Centering the
// mocked random value in the target face's bucket makes the intent obvious
// without leaning on floating-point edges.
function randomFor(face: number, faces: number): number {
  return (face - 0.5) / faces;
}

function mockDice(rolls: Array<{ face: number; faces: number }>) {
  const spy = vi.spyOn(Math, "random");
  for (const { face, faces } of rolls) spy.mockReturnValueOnce(randomFor(face, faces));
  return spy;
}

const ATTACK_RESOLUTION: TurnResolution = {
  source: "Longsword",
  cost: { kind: "action" },
  toHit: { bonus: 5, critRange: 20 },
  effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
};

const SAVE_RESOLUTION: TurnResolution = {
  source: "Sacred Flame",
  cost: { kind: "action" },
  save: { dc: 13, ability: "dexterity" },
  effect: { spec: { count: 1, faces: 8, modifier: 0 }, kind: "damage", damageType: "radiant" },
};

const AUTO_HIT_RESOLUTION: TurnResolution = {
  source: "Magic Missile",
  cost: { kind: "action" },
  effect: { spec: { count: 3, faces: 4, modifier: 3 }, kind: "damage", damageType: "force" },
};

const NO_ROLL_RESOLUTION: TurnResolution = {
  source: "Druidcraft",
  cost: { kind: "action" },
};

function makeTurnState(overrides: Partial<ResolutionTurnState> = {}) {
  return {
    actionsRemaining: 1,
    bonusActionUsed: false,
    reactionUsed: false,
    consumeAction: vi.fn(),
    consumeBonusAction: vi.fn(),
    consumeReaction: vi.fn(),
    ...overrides,
  };
}

function wrapperFor(rollModifiers: RollModifier[] = []) {
  return ({ children }: { children: ReactNode }) => (
    <RollProvider characterId="c1" sessionId="s1" rollModifiers={rollModifiers}>
      {children}
    </RollProvider>
  );
}

function setup(args: {
  resolution: TurnResolution;
  turnState?: ReturnType<typeof makeTurnState>;
  commit?: ReturnType<typeof vi.fn<(rolls: ResolutionRolls) => void>>;
  manualMode?: RollMode;
  rollModifiers?: RollModifier[];
}) {
  const turnState = args.turnState ?? makeTurnState();
  const commit = args.commit ?? vi.fn();
  const { result, rerender } = renderHook(
    (props: { resolution: TurnResolution }) =>
      useResolution({
        resolution: props.resolution,
        turnState,
        commit,
        manualMode: args.manualMode,
      }),
    { wrapper: wrapperFor(args.rollModifiers), initialProps: { resolution: args.resolution } },
  );
  return { result, rerender, turnState, commit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useResolution — attack-roll shape", () => {
  it("drives roll to hit → call it → damage, then commits once with one actionId", () => {
    mockDice([{ face: 15, faces: 20 }, { face: 6, faces: 8 }]);
    const { result, turnState, commit } = setup({ resolution: ATTACK_RESOLUTION });

    expect(result.current.view.steps).toEqual([
      { kind: "toHit", state: "active" },
      { kind: "callIt", state: "pending" },
      { kind: "damage", state: "pending" },
    ]);

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.toHitRoll?.total).toBe(20); // 15 + bonus 5
    expect(result.current.view.verdict).toBeUndefined(); // ambiguous — not crit/miss range

    act(() => result.current.view.onCallCrit());
    expect(result.current.view.verdict).toBe("crit");
    expect(result.current.view.isCrit).toBe(true);

    act(() => result.current.view.onRollEffect());
    expect(result.current.view.effectRoll?.spec.crit).toBe(true); // crit-doubled dice

    expect(result.current.view.readyToComplete).toBe(true);
    act(() => result.current.view.onComplete());

    expect(turnState.consumeAction).toHaveBeenCalledTimes(1);
    expect(turnState.consumeBonusAction).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ verdict: "crit", total: 20, bonus: 5 });
    expect(rolls.effect).toMatchObject({ kind: "damage", crit: true });
    expect(rolls.save).toBeNull();
    expect(rolls.actionId).toBeTruthy();
    expect(result.current.view.completed).toBe(true);
  });

  it("a nat 1 die-locks to miss and skips damage — completion needs no roll of it", () => {
    mockDice([{ face: 1, faces: 20 }]);
    const { result, commit } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.verdict).toBe("miss");
    expect(result.current.view.attack?.nat1).toBe(true);

    // Die-locked: a manual call can't override it.
    act(() => result.current.view.onCallCrit());
    expect(result.current.view.verdict).toBe("miss");

    expect(result.current.view.readyToComplete).toBe(true);
    act(() => result.current.view.onComplete());

    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ verdict: "miss" });
    expect(rolls.effect).toBeNull();
  });

  it("a nat 20 auto-crits and locks — manual miss is refused", () => {
    mockDice([{ face: 20, faces: 20 }, { face: 4, faces: 8 }]);
    const { result } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.verdict).toBe("crit");

    act(() => result.current.view.onCallMiss());
    expect(result.current.view.verdict).toBe("crit"); // refused — die-locked
  });

  it("rolling damage on an unresolved roll implicitly resolves the verdict to hit (#811)", () => {
    mockDice([{ face: 12, faces: 20 }, { face: 5, faces: 8 }]);
    const { result } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.verdict).toBeUndefined();

    act(() => result.current.view.onRollEffect());
    expect(result.current.view.verdict).toBe("hit");
    expect(result.current.view.isCrit).toBe(false);
    expect(result.current.view.effectRoll?.spec.crit).toBeUndefined();
  });

  it("surfaces the state-driven ADV/DIS chip on the to-hit roll (#486, mirrors useAttackRolls)", () => {
    const poisoned: RollModifier[] = [{ mode: "disadvantage", kind: "attack", source: "Poisoned" }];
    mockDice([{ face: 10, faces: 20 }]);
    const { result } = setup({ resolution: ATTACK_RESOLUTION, rollModifiers: poisoned });

    expect(result.current.view.attackChip).toBe("disadvantage — Poisoned");
    expect(result.current.view.attackMode).toBe("disadvantage");
  });
});

describe("useResolution — saving-throw shape", () => {
  it("the announce step is immediately done; completion waits on the damage roll", () => {
    mockDice([{ face: 5, faces: 8 }]);
    const { result, commit, turnState } = setup({ resolution: SAVE_RESOLUTION });

    expect(result.current.view.steps).toEqual([
      { kind: "announceSave", state: "done" },
      { kind: "damage", state: "active" },
    ]);
    expect(result.current.view.readyToComplete).toBe(false);

    act(() => result.current.view.onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.save).toEqual({ dc: 13, ability: "dexterity" });
    expect(rolls.effect).toMatchObject({ kind: "damage", crit: false });
    expect(turnState.consumeAction).toHaveBeenCalledTimes(1);
  });

  it("a save with no effect is ready the instant it renders — one tap, no roll", () => {
    const noEffectSave: TurnResolution = { ...SAVE_RESOLUTION, effect: undefined };
    const { result, commit } = setup({ resolution: noEffectSave });

    expect(result.current.view.steps).toEqual([{ kind: "announceSave", state: "done" }]);
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.effect).toBeNull();
    expect(rolls.save).toEqual({ dc: 13, ability: "dexterity" });
  });
});

describe("useResolution — auto-hit shape", () => {
  it("straight to damage, no to-hit or call-it steps", () => {
    mockDice([{ face: 3, faces: 4 }, { face: 2, faces: 4 }, { face: 4, faces: 4 }]);
    const { result, commit } = setup({ resolution: AUTO_HIT_RESOLUTION });

    expect(result.current.view.steps).toEqual([{ kind: "damage", state: "active" }]);
    act(() => result.current.view.onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.save).toBeNull();
    expect(rolls.effect).toMatchObject({ kind: "damage", crit: false });
  });
});

describe("useResolution — no-roll shape", () => {
  it("is ready immediately and commits with everything null on one tap", () => {
    const { result, commit, turnState } = setup({ resolution: NO_ROLL_RESOLUTION });

    expect(result.current.view.steps).toEqual([]);
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    expect(commit).toHaveBeenCalledTimes(1);
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls).toMatchObject({ toHit: null, save: null, effect: null });
    expect(turnState.consumeAction).toHaveBeenCalledTimes(1);
  });

  it("a second onComplete call is inert (completed guard, no double spend)", () => {
    const { result, commit, turnState } = setup({ resolution: NO_ROLL_RESOLUTION });
    act(() => result.current.view.onComplete());
    act(() => result.current.view.onComplete());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(turnState.consumeAction).toHaveBeenCalledTimes(1);
  });
});

describe("useResolution — economy gating and spend site", () => {
  it("action-cost resolution: disabled and inert when no action remains", () => {
    const turnState = makeTurnState({ actionsRemaining: 0 });
    const { result, commit } = setup({ resolution: NO_ROLL_RESOLUTION, turnState });

    expect(result.current.view.disabled).toBe(true);
    act(() => result.current.view.onComplete());
    expect(commit).not.toHaveBeenCalled();
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("a bonus-action-cost resolution spends the bonus action slot, not the action", () => {
    const bonusResolution: TurnResolution = { ...NO_ROLL_RESOLUTION, cost: { kind: "bonusAction" } };
    const { result, turnState } = setup({ resolution: bonusResolution });

    act(() => result.current.view.onComplete());
    expect(turnState.consumeBonusAction).toHaveBeenCalledTimes(1);
    expect(turnState.consumeAction).not.toHaveBeenCalled();
  });

  it("a reaction-cost resolution spends the reaction slot", () => {
    const reactionResolution: TurnResolution = { ...NO_ROLL_RESOLUTION, cost: { kind: "reaction" } };
    const { result, turnState } = setup({ resolution: reactionResolution });

    act(() => result.current.view.onComplete());
    expect(turnState.consumeReaction).toHaveBeenCalledTimes(1);
  });
});

describe("useResolution — reset", () => {
  it("mints a fresh actionId and clears roll state for the next resolution", () => {
    mockDice([{ face: 3, faces: 4 }]);
    const commit = vi.fn();
    const turnState = makeTurnState();
    const { result } = setup({ resolution: AUTO_HIT_RESOLUTION, commit, turnState });

    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());
    const firstActionId = (commit.mock.calls[0][0] as ResolutionRolls).actionId;

    act(() => result.current.reset());
    expect(result.current.view.completed).toBe(false);
    expect(result.current.view.effectRoll).toBeNull();

    mockDice([{ face: 2, faces: 4 }]);
    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());
    const secondActionId = (commit.mock.calls[1][0] as ResolutionRolls).actionId;

    expect(secondActionId).not.toBe(firstActionId);
  });
});
