import { describe, expect, it } from "vitest";

import {
  computeResolutionSteps,
  resolutionComplete,
  resolutionReady,
  type InstanceRollState,
  type ResolutionRollState,
} from "@/lib/resolutionSteps";
import type { RollResult } from "@/lib/dice";
import type { TurnResolution } from "@character-sheet/shared-types";

type Descriptor = Pick<TurnResolution, "toHit" | "save" | "effect" | "instances">;

const TO_HIT: NonNullable<TurnResolution["toHit"]> = { bonus: 5, critRange: 20 };
const SAVE: NonNullable<TurnResolution["save"]> = { dc: 13, ability: "dexterity" };
const EFFECT: NonNullable<TurnResolution["effect"]> = {
  spec: { count: 1, faces: 8, modifier: 3 },
  kind: "damage",
  damageType: "fire",
};

const ROLL = { dice: [{ value: 15, dropped: false }], modifier: 5, total: 20, spec: { count: 1, faces: 20 } } as RollResult;

function state(overrides: Partial<ResolutionRollState> = {}): ResolutionRollState {
  return { toHit: null, verdict: undefined, effect: null, ...overrides };
}

describe("computeResolutionSteps — attack-roll shape", () => {
  const resolution: Descriptor = { toHit: TO_HIT, save: undefined, effect: EFFECT };

  it("pre-roll: toHit active, callIt/damage pending, nothing settled", () => {
    expect(computeResolutionSteps(resolution, state())).toEqual([
      { kind: "toHit", state: "active", settled: false },
      { kind: "callIt", state: "pending", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);
  });

  it("rolled, unresolved: callIt AND damage both active (implicit hit, #811)", () => {
    expect(computeResolutionSteps(resolution, state({ toHit: ROLL }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "active", settled: false },
      { kind: "damage", state: "active", settled: false },
    ]);
  });

  it("miss verdict parks damage as pending yet settled — a missed attack deals no damage", () => {
    expect(computeResolutionSteps(resolution, state({ toHit: ROLL, verdict: "miss" }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "done", settled: true },
      { kind: "damage", state: "pending", settled: true },
    ]);
  });

  it("crit verdict + damage rolled: everything done", () => {
    expect(
      computeResolutionSteps(resolution, { toHit: ROLL, verdict: "crit", effect: ROLL }),
    ).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "done", settled: true },
      { kind: "damage", state: "done", settled: true },
    ]);
  });

  it("omits the damage step entirely when the resolution has no effect", () => {
    const noEffect: Descriptor = { toHit: TO_HIT, save: undefined, effect: undefined };
    expect(computeResolutionSteps(noEffect, state({ toHit: ROLL, verdict: "hit" }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "done", settled: true },
    ]);
  });
});

describe("computeResolutionSteps — saving-throw shape", () => {
  it("announce is immediately done; damage active until rolled", () => {
    const resolution: Descriptor = { toHit: undefined, save: SAVE, effect: EFFECT };
    expect(computeResolutionSteps(resolution, state())).toEqual([
      { kind: "announceSave", state: "done", settled: true },
      { kind: "damage", state: "active", settled: false },
    ]);
    expect(computeResolutionSteps(resolution, state({ effect: ROLL }))).toEqual([
      { kind: "announceSave", state: "done", settled: true },
      { kind: "damage", state: "done", settled: true },
    ]);
  });

  it("a save with no effect (condition-only) emits just the announce step", () => {
    const resolution: Descriptor = { toHit: undefined, save: SAVE, effect: undefined };
    expect(computeResolutionSteps(resolution, state())).toEqual([
      { kind: "announceSave", state: "done", settled: true },
    ]);
  });
});

describe("computeResolutionSteps — auto-hit shape", () => {
  it("straight to damage, no toHit/callIt/announce", () => {
    const resolution: Descriptor = { toHit: undefined, save: undefined, effect: EFFECT };
    expect(computeResolutionSteps(resolution, state())).toEqual([
      { kind: "damage", state: "active", settled: false },
    ]);
    expect(computeResolutionSteps(resolution, state({ effect: ROLL }))).toEqual([
      { kind: "damage", state: "done", settled: true },
    ]);
  });
});

function instance(overrides: Partial<InstanceRollState> = {}): InstanceRollState {
  return { toHit: null, verdict: undefined, effect: null, ...overrides };
}

describe("computeResolutionSteps — attack-instanced shape (Scorching Ray, Eldritch Blast)", () => {
  const resolution: Descriptor = {
    toHit: TO_HIT,
    save: undefined,
    effect: EFFECT,
    instances: { count: 3, roll: "each" },
  };

  it("pre-roll: toHit active, callIt/damage pending — same aggregated three steps as un-instanced", () => {
    expect(computeResolutionSteps(resolution, state({ instances: [instance(), instance(), instance()] }))).toEqual([
      { kind: "toHit", state: "active", settled: false },
      { kind: "callIt", state: "pending", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);
  });

  it("toHit step needs EVERY instance rolled before it settles, not just one", () => {
    const instances = [instance({ toHit: ROLL }), instance(), instance()];
    expect(computeResolutionSteps(resolution, state({ instances }))).toEqual([
      { kind: "toHit", state: "active", settled: false },
      { kind: "callIt", state: "pending", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);
  });

  it("callIt needs every instance's verdict called, once every instance has rolled", () => {
    const instances = [
      instance({ toHit: ROLL, verdict: "hit" }),
      instance({ toHit: ROLL }),
      instance({ toHit: ROLL, verdict: "miss" }),
    ];
    expect(computeResolutionSteps(resolution, state({ instances }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "active", settled: false },
      { kind: "damage", state: "pending", settled: false },
    ]);
  });

  it("mixed hit/miss/crit: damage settles only once every non-miss instance has its own damage roll", () => {
    const instances = [
      instance({ toHit: ROLL, verdict: "hit", effect: ROLL }),
      instance({ toHit: ROLL, verdict: "miss" }),
      instance({ toHit: ROLL, verdict: "crit" }),
    ];
    expect(computeResolutionSteps(resolution, state({ instances }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "done", settled: true },
      { kind: "damage", state: "active", settled: false },
    ]);

    const allSettled = [
      instance({ toHit: ROLL, verdict: "hit", effect: ROLL }),
      instance({ toHit: ROLL, verdict: "miss" }),
      instance({ toHit: ROLL, verdict: "crit", effect: ROLL }),
    ];
    expect(computeResolutionSteps(resolution, state({ instances: allSettled }))).toEqual([
      { kind: "toHit", state: "done", settled: true },
      { kind: "callIt", state: "done", settled: true },
      { kind: "damage", state: "done", settled: true },
    ]);
  });

  it("ready only once all three instances are fully settled (readiness gate)", () => {
    const twoSettled = [
      instance({ toHit: ROLL, verdict: "hit", effect: ROLL }),
      instance({ toHit: ROLL, verdict: "miss" }),
      instance({ toHit: ROLL }),
    ];
    expect(resolutionReady(computeResolutionSteps(resolution, state({ instances: twoSettled })))).toBe(false);

    const allSettled = [
      instance({ toHit: ROLL, verdict: "hit", effect: ROLL }),
      instance({ toHit: ROLL, verdict: "miss" }),
      instance({ toHit: ROLL, verdict: "crit", effect: ROLL }),
    ];
    expect(resolutionReady(computeResolutionSteps(resolution, state({ instances: allSettled })))).toBe(true);
  });
});

describe("computeResolutionSteps — auto-hit instanced shape, roll:'each' (2024 Magic Missile)", () => {
  const resolution: Descriptor = { toHit: undefined, save: undefined, effect: EFFECT, instances: { count: 3, roll: "each" } };

  it("straight to a single aggregated damage step, no toHit/callIt", () => {
    expect(computeResolutionSteps(resolution, state({ instances: [instance(), instance(), instance()] }))).toEqual([
      { kind: "damage", state: "active", settled: false },
    ]);
  });

  it("settles only once every dart has its own roll", () => {
    const twoRolled = [instance({ effect: ROLL }), instance({ effect: ROLL }), instance()];
    expect(computeResolutionSteps(resolution, state({ instances: twoRolled }))).toEqual([
      { kind: "damage", state: "active", settled: false },
    ]);

    const allRolled = [instance({ effect: ROLL }), instance({ effect: ROLL }), instance({ effect: ROLL })];
    expect(computeResolutionSteps(resolution, state({ instances: allRolled }))).toEqual([
      { kind: "damage", state: "done", settled: true },
    ]);
  });
});

describe("computeResolutionSteps — auto-hit instanced shape, roll:'once' (2014 Magic Missile)", () => {
  it("reuses the un-instanced effect-only branch verbatim — one shared roll, no per-instance state needed", () => {
    const resolution: Descriptor = {
      toHit: undefined,
      save: undefined,
      effect: EFFECT,
      instances: { count: 3, roll: "once" },
    };
    expect(computeResolutionSteps(resolution, state())).toEqual([{ kind: "damage", state: "active", settled: false }]);
    expect(computeResolutionSteps(resolution, state({ effect: ROLL }))).toEqual([
      { kind: "damage", state: "done", settled: true },
    ]);
  });
});

describe("computeResolutionSteps — no-roll shape", () => {
  it("emits no steps at all", () => {
    const resolution: Descriptor = { toHit: undefined, save: undefined, effect: undefined };
    expect(computeResolutionSteps(resolution, state())).toEqual([]);
  });
});

describe("resolutionComplete", () => {
  it("false for an empty step list", () => {
    expect(resolutionComplete([])).toBe(false);
  });

  it("false while any step is unsettled", () => {
    expect(
      resolutionComplete([
        { kind: "toHit", state: "done", settled: true },
        { kind: "callIt", state: "active", settled: false },
        { kind: "damage", state: "active", settled: false },
      ]),
    ).toBe(false);
  });

  it("true when every step is settled", () => {
    expect(
      resolutionComplete([
        { kind: "toHit", state: "done", settled: true },
        { kind: "callIt", state: "done", settled: true },
        { kind: "damage", state: "done", settled: true },
      ]),
    ).toBe(true);
  });

  it("a called miss settles the whole rail, its parked damage step included", () => {
    const steps = computeResolutionSteps(
      { toHit: TO_HIT, save: undefined, effect: EFFECT },
      state({ toHit: ROLL, verdict: "miss" }),
    );
    expect(resolutionComplete(steps)).toBe(true);
  });
});

describe("resolutionReady", () => {
  it("true for an empty step list (no-roll — one tap, immediately ready)", () => {
    expect(resolutionReady([])).toBe(true);
  });

  it("mirrors resolutionComplete for a non-empty list", () => {
    expect(resolutionReady([{ kind: "damage", state: "active", settled: false }])).toBe(false);
    expect(resolutionReady([{ kind: "damage", state: "done", settled: true }])).toBe(true);
  });
});
