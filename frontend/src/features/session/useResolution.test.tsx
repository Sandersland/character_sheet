import type { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { RollProvider } from "@/features/dice/RollContext";
import { useResolution, type ResolutionRolls, type ResolutionTurnState } from "@/features/session/useResolution";
import type { RollMode } from "@/lib/dice";
import type { RollModifier } from "@/types/character";
import type { TurnResolution } from "@character-sheet/shared-types";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

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

function attackResolutionWithCritRange(critRange: number): TurnResolution {
  return { ...ATTACK_RESOLUTION, toHit: { ...ATTACK_RESOLUTION.toHit!, critRange } };
}

const SAVE_RESOLUTION: TurnResolution = {
  source: "Sacred Flame",
  cost: { kind: "action" },
  save: { dc: 13, ability: "dexterity" },
  effect: { spec: { count: 1, faces: 8, modifier: 0 }, kind: "damage", damageType: "radiant" },
};

// A genuinely un-instanced auto-hit spell (real served shape — Acid Splash has no attack roll, no save,
// no instances) — kept distinct from Magic Missile below, which is ALWAYS instanced (#1981).
const AUTO_HIT_RESOLUTION: TurnResolution = {
  source: "Acid Splash",
  cost: { kind: "action" },
  effect: { spec: { count: 1, faces: 6, modifier: 0 }, kind: "damage", damageType: "acid" },
};

// Real served Magic Missile shape (#1981): per-dart dice (1d4+1), instances metadata carried
// alongside — never the pre-#1981 combined-roll shape.
const MAGIC_MISSILE_EACH: TurnResolution = {
  source: "Magic Missile",
  cost: { kind: "action" },
  effect: { spec: { count: 1, faces: 4, modifier: 1 }, kind: "damage", damageType: "force" },
  instances: { count: 3, roll: "each" },
};

const MAGIC_MISSILE_ONCE: TurnResolution = {
  ...MAGIC_MISSILE_EACH,
  instances: { count: 3, roll: "once" },
};

const SCORCHING_RAY_RESOLUTION: TurnResolution = {
  source: "Scorching Ray",
  cost: { kind: "action" },
  toHit: { bonus: 6, critRange: 20 },
  effect: { spec: { count: 2, faces: 6, modifier: 0 }, kind: "damage", damageType: "fire" },
  instances: { count: 3, roll: "each" },
};

// Cantrip-instanced (#1983 review): Eldritch Blast's beam count scales with character level
// (cantripLevel scaling, not slot upcast), so no slotLevel is served in the resolution at all — the
// hook's per-instance loop doesn't care either way, but this pins that the AC's own example (2 beams
// at a level-5-tier character) actually flows through it.
const ELDRITCH_BLAST_RESOLUTION: TurnResolution = {
  source: "Eldritch Blast",
  cost: { kind: "action" },
  toHit: { bonus: 6, critRange: 20 },
  effect: { spec: { count: 1, faces: 10, modifier: 0 }, kind: "damage", damageType: "force" },
  instances: { count: 2, roll: "each" },
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
      { kind: "toHit", state: "active", settled: false },
      { kind: "callIt", state: "pending", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.toHitRoll?.total).toBe(20);
    expect(result.current.view.verdict).toBeUndefined();

    act(() => result.current.view.onCallCrit());
    expect(result.current.view.verdict).toBe("crit");
    expect(result.current.view.isCrit).toBe(true);

    act(() => result.current.view.onRollEffect());
    expect(result.current.view.effectRoll?.spec.crit).toBe(true);

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
    expect(result.current.view.verdict).toBe("crit");
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

  it("folds a flat roll-mode modifier (exhaustion) into the persisted bonus so kept + bonus reconciles to total (#1847 finding 7)", () => {
    const exhausted: RollModifier[] = [{ mode: "flat", kind: "attack", modifier: -2, source: "Exhaustion" }];
    mockDice([{ face: 15, faces: 20 }, { face: 6, faces: 8 }]);
    const { result, commit } = setup({ resolution: ATTACK_RESOLUTION, rollModifiers: exhausted });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.toHitRoll?.total).toBe(18);

    act(() => result.current.view.onCallCrit());
    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());

    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ kept: 15, bonus: 3, total: 18 });
    expect(rolls.toHit!.kept + rolls.toHit!.bonus).toBe(rolls.toHit!.total);
  });

  it("onCallCrit is a no-op once damage has already been rolled (root guard, #1845)", () => {
    mockDice([{ face: 12, faces: 20 }, { face: 5, faces: 8 }]);
    const { result } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    act(() => result.current.view.onRollEffect());
    expect(result.current.view.verdict).toBe("hit");

    act(() => result.current.view.onCallCrit());
    expect(result.current.view.verdict).toBe("hit");
    expect(result.current.view.isCrit).toBe(false);
  });

  it("onCallCrit is a no-op after a called miss", () => {
    mockDice([{ face: 10, faces: 20 }]);
    const { result } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.verdict).toBeUndefined();
    act(() => result.current.view.onCallMiss());
    expect(result.current.view.verdict).toBe("miss");

    act(() => result.current.view.onCallCrit());
    expect(result.current.view.verdict).toBe("miss");
  });
});

describe("useResolution — Champion widened crit range (#1120, coverage restored #1845)", () => {
  it("nat 19 does NOT crit at critRange:20 (the SRD default)", () => {
    mockDice([{ face: 19, faces: 20 }]);
    const { result } = setup({ resolution: attackResolutionWithCritRange(20) });

    act(() => result.current.view.onRollToHit());

    expect(result.current.view.attack?.criticalHit).toBe(false);
    expect(result.current.view.verdict).toBeUndefined();
    expect(result.current.view.isCrit).toBe(false);
  });

  it("nat 19 crits and auto-verdicts to 'crit' at critRange:19 (Champion L3, Improved Critical)", () => {
    mockDice([{ face: 19, faces: 20 }]);
    const { result } = setup({ resolution: attackResolutionWithCritRange(19) });

    act(() => result.current.view.onRollToHit());

    expect(result.current.view.attack?.criticalHit).toBe(true);
    expect(result.current.view.verdict).toBe("crit");
    expect(result.current.view.isCrit).toBe(true);
  });

  it("nat 18 crits at critRange:18 (Champion L15, Superior Critical)", () => {
    mockDice([{ face: 18, faces: 20 }]);
    const { result } = setup({ resolution: attackResolutionWithCritRange(18) });

    act(() => result.current.view.onRollToHit());

    expect(result.current.view.attack?.criticalHit).toBe(true);
    expect(result.current.view.verdict).toBe("crit");
  });

  it("nat 17 does NOT crit at critRange:18 — one face below the widened threshold", () => {
    mockDice([{ face: 17, faces: 20 }]);
    const { result } = setup({ resolution: attackResolutionWithCritRange(18) });

    act(() => result.current.view.onRollToHit());

    expect(result.current.view.attack?.criticalHit).toBe(false);
    expect(result.current.view.verdict).toBeUndefined();
    expect(result.current.view.isCrit).toBe(false);
  });

  it("doubles damage dice on a widened-range crit (nat 19, not a natural 20)", () => {
    mockDice([{ face: 19, faces: 20 }, { face: 4, faces: 8 }, { face: 5, faces: 8 }]);
    const { result, commit } = setup({ resolution: attackResolutionWithCritRange(19) });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.attack?.nat20).toBe(false);
    expect(result.current.view.verdict).toBe("crit");

    act(() => result.current.view.onRollEffect());
    expect(result.current.view.effectRoll?.spec.crit).toBe(true);
    expect(result.current.view.effectRoll?.dice).toHaveLength(2);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.effect).toMatchObject({ kind: "damage", crit: true });
  });
});

describe("useResolution — saving-throw shape", () => {
  it("the announce step is immediately done; completion waits on the damage roll", () => {
    mockDice([{ face: 5, faces: 8 }]);
    const { result, commit, turnState } = setup({ resolution: SAVE_RESOLUTION });

    expect(result.current.view.steps).toEqual([
      { kind: "announceSave", state: "done", settled: true },
      { kind: "damage", state: "active", settled: false },
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

    expect(result.current.view.steps).toEqual([{ kind: "announceSave", state: "done", settled: true }]);
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.effect).toBeNull();
    expect(rolls.save).toEqual({ dc: 13, ability: "dexterity" });
  });
});

describe("useResolution — auto-hit shape", () => {
  it("straight to damage, no to-hit or call-it steps", () => {
    mockDice([{ face: 4, faces: 6 }]);
    const { result, commit } = setup({ resolution: AUTO_HIT_RESOLUTION });

    expect(result.current.view.steps).toEqual([{ kind: "damage", state: "active", settled: false }]);
    act(() => result.current.view.onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.save).toBeNull();
    expect(rolls.effect).toMatchObject({ kind: "damage", crit: false });
    expect(rolls.instances).toBeUndefined();
  });
});

describe("useResolution — auto-hit instanced shape, roll:'each' (2024 Magic Missile)", () => {
  it("each dart rolls its own damage; ready only once every dart has rolled", () => {
    mockDice([{ face: 3, faces: 4 }, { face: 2, faces: 4 }, { face: 4, faces: 4 }]);
    const { result, commit } = setup({ resolution: MAGIC_MISSILE_EACH });

    expect(result.current.view.steps).toEqual([{ kind: "damage", state: "active", settled: false }]);
    expect(result.current.view.instances).toHaveLength(3);

    act(() => result.current.view.instances![0].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(false);
    act(() => result.current.view.instances![1].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(false);
    act(() => result.current.view.instances![2].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    expect(result.current.view.instances![0].effectRoll?.total).toBe(4);
    expect(result.current.view.instances![1].effectRoll?.total).toBe(3);
    expect(result.current.view.instances![2].effectRoll?.total).toBe(5);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.effect).toBeNull();
    expect(rolls.instances).toHaveLength(3);
    expect(rolls.instances!.map((i) => i.effect?.total)).toEqual([4, 3, 5]);
  });
});

describe("useResolution — auto-hit instanced shape, roll:'once' (2014 Magic Missile)", () => {
  it("rolls damage once and fans the SAME total to every dart", () => {
    mockDice([{ face: 3, faces: 4 }]);
    const { result, commit } = setup({ resolution: MAGIC_MISSILE_ONCE });

    // The shared roll reuses the top-level effect step/button, exactly like a plain auto-hit spell.
    expect(result.current.view.steps).toEqual([{ kind: "damage", state: "active", settled: false }]);
    act(() => result.current.view.onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    expect(result.current.view.instances).toHaveLength(3);
    for (const instance of result.current.view.instances!) {
      expect(instance.effectRoll?.total).toBe(4);
    }

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.effect).toBeNull();
    expect(rolls.instances).toHaveLength(3);
    expect(rolls.instances!.every((i) => i.effect?.total === 4)).toBe(true);
    expect(rolls.instances!.every((i) => i.effect?.crit === false)).toBe(true);
  });

  it("a crit-called dart doubles the SHARED roll's DICE ONLY (5e crit rule), not the flat modifier — 1d4+1 rolled 3 (total 4) crits to 7, not 8", () => {
    mockDice([{ face: 3, faces: 4 }]);
    const { result, commit } = setup({ resolution: MAGIC_MISSILE_ONCE });

    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.instances![1].onCallCrit());

    expect(result.current.view.instances![0].effectRoll?.total).toBe(4);
    expect(result.current.view.instances![1].effectRoll?.total).toBe(7);
    expect(result.current.view.instances![1].effectRoll?.dice).toHaveLength(2);
    expect(result.current.view.instances![1].isCrit).toBe(true);
    expect(result.current.view.instances![2].effectRoll?.total).toBe(4);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.instances!.map((i) => ({ total: i.effect?.total, crit: i.effect?.crit, faces: i.effect?.faces }))).toEqual([
      { total: 4, crit: false, faces: [3] },
      { total: 7, crit: true, faces: [3, 3] },
      { total: 4, crit: false, faces: [3] },
    ]);
    // The committed spec/faces reconcile to the total, matching sessionLogFeed's drill-in contract.
    expect(rolls.instances![1].effect!.spec).toBe("2d4 + 1 (crit)");
  });

  it("the crit flag toggles freely until commit — a mis-click can be undone", () => {
    mockDice([{ face: 3, faces: 4 }]);
    const { result } = setup({ resolution: MAGIC_MISSILE_ONCE });

    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.instances![1].onCallCrit());
    expect(result.current.view.instances![1].isCrit).toBe(true);
    expect(result.current.view.instances![1].effectRoll?.total).toBe(7);

    act(() => result.current.view.instances![1].onCallCrit());
    expect(result.current.view.instances![1].isCrit).toBe(false);
    expect(result.current.view.instances![1].effectRoll?.total).toBe(4);
  });
});

describe("useResolution — attack-instanced shape (Scorching Ray, Eldritch Blast)", () => {
  it("requires all three to-hit + call-it + damage steps settled before readyToComplete", () => {
    mockDice([
      { face: 15, faces: 20 }, // instance 0 to-hit
      { face: 1, faces: 20 }, // instance 1 to-hit (nat 1, auto-miss)
      { face: 20, faces: 20 }, // instance 2 to-hit (nat 20, auto-crit)
      { face: 4, faces: 6 },
      { face: 3, faces: 6 }, // instance 0 damage (2d6)
      { face: 1, faces: 6 },
      { face: 2, faces: 6 }, // instance 2 crit damage (4d6)
      { face: 5, faces: 6 },
      { face: 6, faces: 6 },
    ]);
    const { result, commit, turnState } = setup({ resolution: SCORCHING_RAY_RESOLUTION });

    expect(result.current.view.steps).toEqual([
      { kind: "toHit", state: "active", settled: false },
      { kind: "callIt", state: "pending", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);
    expect(result.current.view.instances).toHaveLength(3);

    act(() => result.current.view.instances![0].onRollToHit());
    act(() => result.current.view.instances![1].onRollToHit());
    act(() => result.current.view.instances![2].onRollToHit());
    expect(result.current.view.readyToComplete).toBe(false);

    // instance 1 is a nat 1 — auto-miss, no call needed; instance 2 nat 20 auto-crits.
    expect(result.current.view.instances![1].verdict).toBe("miss");
    expect(result.current.view.instances![2].verdict).toBe("crit");

    act(() => result.current.view.instances![0].onCallCrit());
    expect(result.current.view.readyToComplete).toBe(false);

    act(() => result.current.view.instances![0].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(false);
    act(() => result.current.view.instances![2].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    expect(turnState.consumeAction).toHaveBeenCalledTimes(1);
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toBeNull();
    expect(rolls.effect).toBeNull();
    expect(rolls.instances).toHaveLength(3);
    expect(rolls.instances![0].toHit).toMatchObject({ verdict: "crit" });
    expect(rolls.instances![0].effect).toMatchObject({ crit: true });
    expect(rolls.instances![1].toHit).toMatchObject({ verdict: "miss" });
    expect(rolls.instances![1].effect).toBeUndefined();
    expect(rolls.instances![2].toHit).toMatchObject({ verdict: "crit" });
    expect(rolls.instances![2].effect).toMatchObject({ crit: true });
  });

  it("a mixed hit/miss/crit cast commits one op with three instances entries", () => {
    mockDice([
      { face: 10, faces: 20 },
      { face: 3, faces: 20 },
      { face: 15, faces: 20 },
      { face: 4, faces: 6 },
      { face: 5, faces: 6 },
      { face: 2, faces: 6 },
      { face: 3, faces: 6 },
    ]);
    const { result, commit } = setup({ resolution: SCORCHING_RAY_RESOLUTION });

    act(() => result.current.view.instances![0].onRollToHit());
    act(() => result.current.view.instances![0].onCallMiss());
    act(() => result.current.view.instances![1].onRollToHit());
    act(() => result.current.view.instances![1].onRollEffect()); // implicit hit (#811)
    act(() => result.current.view.instances![2].onRollToHit());
    act(() => result.current.view.instances![2].onCallCrit());
    act(() => result.current.view.instances![2].onRollEffect());

    expect(result.current.view.instances![0].verdict).toBe("miss");
    expect(result.current.view.instances![1].verdict).toBe("hit");
    expect(result.current.view.instances![2].verdict).toBe("crit");
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    expect(commit).toHaveBeenCalledTimes(1);
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.instances).toHaveLength(3);
  });

  it("rolling an instance's damage before its to-hit resolves an implicit hit instead of leaving its verdict permanently undefined (#811, regression)", () => {
    mockDice([{ face: 4, faces: 6 }, { face: 3, faces: 6 }, { face: 10, faces: 20 }]);
    const { result } = setup({ resolution: SCORCHING_RAY_RESOLUTION });

    // Instance 0 rolls damage first — before it has ever rolled to hit. The strip's DamageArea
    // permits this (canRoll mirrors ResolutionRail's own DamageStepContent, gated only on a called
    // miss, not on the die having landed yet) — this must not strand the verdict at undefined forever.
    act(() => result.current.view.instances![0].onRollEffect());
    expect(result.current.view.instances![0].effectRoll).not.toBeNull();
    expect(result.current.view.instances![0].verdict).toBe("hit");
    expect(result.current.view.instances![0].toHitRoll).toBeNull();

    // The toHit step still needs the die literally rolled for every instance before completion —
    // same as the un-instanced rail (rolling damage alone never satisfies stepRail's own hasRoll).
    act(() => result.current.view.instances![0].onRollToHit());
    expect(result.current.view.instances![0].toHitRoll).not.toBeNull();
  });

  it("rolling to-hit after an instance's speculative damage roll keeps that damage instead of discarding it", () => {
    mockDice([{ face: 4, faces: 6 }, { face: 3, faces: 6 }, { face: 10, faces: 20 }]);
    const { result } = setup({ resolution: SCORCHING_RAY_RESOLUTION });

    act(() => result.current.view.instances![0].onRollEffect());
    const rolledEffect = result.current.view.instances![0].effectRoll;
    expect(rolledEffect).not.toBeNull();

    act(() => result.current.view.instances![0].onRollToHit());
    expect(result.current.view.instances![0].effectRoll).toEqual(rolledEffect);
  });

  it("Eldritch Blast's own served beam count (2 at a level-5-tier character) drives the loop and the committed op — the AC's own example", () => {
    mockDice([
      { face: 10, faces: 20 },
      { face: 15, faces: 20 },
      { face: 6, faces: 10 },
      { face: 4, faces: 10 },
    ]);
    const { result, commit } = setup({ resolution: ELDRITCH_BLAST_RESOLUTION });

    expect(result.current.view.instances).toHaveLength(2);
    act(() => result.current.view.instances![0].onRollToHit());
    act(() => result.current.view.instances![0].onRollEffect());
    act(() => result.current.view.instances![1].onRollToHit());
    act(() => result.current.view.instances![1].onRollEffect());
    expect(result.current.view.readyToComplete).toBe(true);

    act(() => result.current.view.onComplete());
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.instances).toHaveLength(2);
    expect(rolls.instances!.every((i) => i.toHit != null && i.effect != null)).toBe(true);
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

describe("useResolution — onComplete ordering (#1847 finding 3)", () => {
  it("does not spend the economy slot or mark completed when commit throws", () => {
    const throwingCommit = vi.fn(() => {
      throw new Error("boom");
    });
    const turnState = makeTurnState();
    const { result } = setup({ resolution: NO_ROLL_RESOLUTION, commit: throwingCommit, turnState });

    expect(() => act(() => result.current.view.onComplete())).toThrow("boom");

    expect(throwingCommit).toHaveBeenCalledTimes(1);
    expect(turnState.consumeAction).not.toHaveBeenCalled();
    expect(result.current.view.completed).toBe(false);
  });
});

describe("useResolution — external to-hit boost seam (#1844)", () => {
  it("folds a boost into the committed toHit total and bonus (kept + bonus === total)", () => {
    mockDice([{ face: 15, faces: 20 }, { face: 6, faces: 8 }]);
    const { result, commit } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    expect(result.current.view.toHitRoll?.total).toBe(20);

    act(() => result.current.view.boostToHit(5));
    act(() => result.current.view.onCallCrit());
    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());

    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ kept: 15, bonus: 10, total: 25 });
    expect(rolls.toHit!.kept + rolls.toHit!.bonus).toBe(rolls.toHit!.total);
  });

  it("is inert once completed — a late boost can't rewrite a committed roll", () => {
    mockDice([{ face: 15, faces: 20 }, { face: 6, faces: 8 }]);
    const { result, commit } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    act(() => result.current.view.onCallCrit());
    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());

    act(() => result.current.view.boostToHit(5));

    expect(commit).toHaveBeenCalledTimes(1);
    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ total: 20, bonus: 5 });
  });

  it("reset clears an accumulated boost for the next resolution", () => {
    mockDice([{ face: 15, faces: 20 }]);
    const { result, commit } = setup({ resolution: ATTACK_RESOLUTION });

    act(() => result.current.view.onRollToHit());
    act(() => result.current.view.boostToHit(5));
    act(() => result.current.reset());

    mockDice([{ face: 10, faces: 20 }, { face: 4, faces: 8 }]);
    act(() => result.current.view.onRollToHit());
    act(() => result.current.view.onCallCrit());
    act(() => result.current.view.onRollEffect());
    act(() => result.current.view.onComplete());

    const rolls = commit.mock.calls[0][0] as ResolutionRolls;
    expect(rolls.toHit).toMatchObject({ total: 15, bonus: 5 });
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
