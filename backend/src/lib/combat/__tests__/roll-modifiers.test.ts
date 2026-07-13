import { describe, expect, it } from "vitest";

import { buildRollModifiers } from "@/lib/character/character-serialize.js";
import {
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
} from "@/lib/combat/active-effects.js";
import type { ConditionsMutableState } from "@/lib/combat/conditions.js";
import type { ActiveEffectsMutableState } from "@/lib/combat/active-effects.js";

const noConditions: ConditionsMutableState = { active: [], exhaustion: 0 };
const noEffects: ActiveEffectsMutableState = { buffs: [] };

function condition(key: string): ConditionsMutableState {
  return { active: [{ key: key as never, appliedAt: "2026-01-01T00:00:00.000Z" }], exhaustion: 0 };
}

describe("buildRollModifiers (#486)", () => {
  it("emits Poisoned's disadvantage on attacks + ability checks, sourced to the label", () => {
    const mods = buildRollModifiers(condition("poisoned"), noEffects);
    expect(mods).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Poisoned" },
      { mode: "disadvantage", kind: "check", source: "Poisoned" },
    ]);
  });

  it("emits Rage's advantage on Strength checks + saves from a buff's rollEffects", () => {
    const effects: ActiveEffectsMutableState = {
      buffs: [
        {
          id: "r",
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
          source: "Rage",
          duration: "while-active",
          rollEffects: [
            { mode: "advantage", kind: "check", ability: "strength" },
            { mode: "advantage", kind: "save", ability: "strength" },
          ],
        },
      ],
    };
    expect(buildRollModifiers(noConditions, effects)).toEqual([
      { mode: "advantage", kind: "check", ability: "strength", source: "Rage" },
      { mode: "advantage", kind: "save", ability: "strength", source: "Rage" },
    ]);
  });

  it("merges conditions and buffs together", () => {
    const effects: ActiveEffectsMutableState = {
      buffs: [
        {
          id: "r",
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
          source: "Rage",
          duration: "while-active",
          rollEffects: [{ mode: "advantage", kind: "check", ability: "strength" }],
        },
      ],
    };
    const mods = buildRollModifiers(condition("poisoned"), effects);
    expect(mods).toHaveLength(3);
    expect(mods.map((m) => m.source)).toEqual(["Poisoned", "Poisoned", "Rage"]);
  });

  it("returns [] when no active state grants a roll effect", () => {
    expect(buildRollModifiers(condition("prone"), noEffects)).toEqual([]);
    expect(buildRollModifiers(noConditions, noEffects)).toEqual([]);
  });
});

describe("rollEffects round-trip on ActiveBuff (#486)", () => {
  const rage: ActiveEffectsMutableState = {
    buffs: [
      {
        id: "r",
        key: "rage",
        target: "meleeDamage",
        modifier: 2,
        source: "Rage",
        duration: "while-active",
        rollEffects: [
          { mode: "advantage", kind: "check", ability: "strength" },
          { mode: "advantage", kind: "save", ability: "strength" },
        ],
      },
    ],
  };

  it("survives serialize → normalize", () => {
    const back = normalizeActiveEffectsMutable(
      serializeActiveEffectsState(rage) as never,
    );
    expect(back.buffs[0].rollEffects).toEqual(rage.buffs[0].rollEffects);
  });

  it("drops malformed roll effects and yields undefined when none survive", () => {
    const cleaned = normalizeActiveEffectsMutable({
      buffs: [
        {
          id: "b",
          key: "x",
          target: "athletics",
          modifier: 0,
          source: "X",
          duration: "concentration",
          rollEffects: [
            { mode: "sideways", kind: "check" },
            { mode: "advantage", kind: "bogus" },
            { mode: "advantage", kind: "attack" },
          ],
        },
      ],
    } as never);
    expect(cleaned.buffs[0].rollEffects).toEqual([{ mode: "advantage", kind: "attack" }]);

    const noneLeft = normalizeActiveEffectsMutable({
      buffs: [
        {
          id: "b",
          key: "x",
          target: "athletics",
          modifier: 0,
          source: "X",
          duration: "concentration",
          rollEffects: [{ mode: "bad", kind: "check" }],
        },
      ],
    } as never);
    expect(noneLeft.buffs[0].rollEffects).toBeUndefined();
  });
});
