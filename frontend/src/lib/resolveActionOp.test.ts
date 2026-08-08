import { describe, expect, it } from "vitest";

import { buildResolveActionOp } from "@/lib/resolveActionOp";
import type { ResolutionRolls } from "@/features/session/useResolution";
import type { TurnResolution } from "@character-sheet/shared-types";

const TO_HIT = { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "hit" as const };
const EFFECT = { spec: "1d8+3", faces: [6], total: 9, type: "piercing", kind: "damage" as const, crit: false };

function rolls(overrides: Partial<ResolutionRolls> = {}): ResolutionRolls {
  return { actionId: "action-1", toHit: TO_HIT, save: null, effect: EFFECT, ...overrides };
}

describe("buildResolveActionOp", () => {
  it("maps cost.kind action → action verbatim, carrying source/toHit/save/effect/actionId", () => {
    const resolution: TurnResolution = { source: "Longbow", cost: { kind: "action", attacks: 2 } };

    const op = buildResolveActionOp(resolution, rolls());

    expect(op).toEqual({
      type: "resolveAction",
      actionId: "action-1",
      source: "Longbow",
      cost: { kind: "action", attacks: 2 },
      toHit: TO_HIT,
      save: null,
      effect: EFFECT,
    });
  });

  // #1831 review comment 1: the op's ResolveActionEventCost.kind is "bonus",
  // not "bonusAction" — TurnResolutionCost keeps the useTurnState spelling.
  it("maps cost.kind bonusAction → bonus", () => {
    const resolution: TurnResolution = { source: "Off-hand Dagger", cost: { kind: "bonusAction" } };

    const op = buildResolveActionOp(resolution, rolls());

    expect(op.cost).toEqual({ kind: "bonus" });
  });

  it("maps cost.kind reaction → reaction", () => {
    const resolution: TurnResolution = { source: "Shield", cost: { kind: "reaction" } };

    const op = buildResolveActionOp(resolution, rolls());

    expect(op.cost).toEqual({ kind: "reaction" });
  });

  it("omits cost.attacks when the resolution carries none", () => {
    const resolution: TurnResolution = { source: "Fire Bolt", cost: { kind: "action" } };

    const op = buildResolveActionOp(resolution, rolls());

    expect(op.cost).toEqual({ kind: "action" });
  });

  it("carries an explicit slotLevel for a leveled spell, omitting it otherwise", () => {
    const resolution: TurnResolution = { source: "Magic Missile", cost: { kind: "action" } };

    expect(buildResolveActionOp(resolution, rolls(), 1)).toMatchObject({ slotLevel: 1 });
    expect(buildResolveActionOp(resolution, rolls())).not.toHaveProperty("slotLevel");
  });
});
