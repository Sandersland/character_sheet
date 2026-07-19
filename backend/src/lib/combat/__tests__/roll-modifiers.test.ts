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
    expect(buildRollModifiers(condition("charmed"), noEffects)).toEqual([]);
    expect(buildRollModifiers(noConditions, noEffects)).toEqual([]);
  });

  it("emits Prone's disadvantage on attack rolls, sourced to the label", () => {
    expect(buildRollModifiers(condition("prone"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Prone" },
    ]);
  });

  it("emits Restrained's disadvantage on attacks + Dexterity saves", () => {
    expect(buildRollModifiers(condition("restrained"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Restrained" },
      { mode: "disadvantage", kind: "save", ability: "dexterity", source: "Restrained" },
    ]);
  });

  it("emits Blinded's disadvantage on attack rolls", () => {
    expect(buildRollModifiers(condition("blinded"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Blinded" },
    ]);
  });

  it("emits Frightened's disadvantage on attacks + ability checks", () => {
    expect(buildRollModifiers(condition("frightened"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Frightened" },
      { mode: "disadvantage", kind: "check", source: "Frightened" },
    ]);
  });

  it("emits Grappled's disadvantage on attacks (vs targets other than the grappler)", () => {
    expect(buildRollModifiers(condition("grappled"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Grappled" },
    ]);
  });

  it("emits Invisible's advantage on initiative + attack rolls (2024)", () => {
    expect(buildRollModifiers(condition("invisible"), noEffects)).toEqual([
      { mode: "advantage", kind: "initiative", source: "Invisible" },
      { mode: "advantage", kind: "attack", source: "Invisible" },
    ]);
  });

  it("emits Incapacitated's disadvantage on initiative (2024 Surprised)", () => {
    expect(buildRollModifiers(condition("incapacitated"), noEffects)).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Incapacitated" },
    ]);
  });
});

describe("buildRollModifiers exhaustion thresholds (#846)", () => {
  function exhaustion(level: number): ConditionsMutableState {
    return { active: [], exhaustion: level };
  }

  it("level 0 grants no roll effects", () => {
    expect(buildRollModifiers(exhaustion(0), noEffects)).toEqual([]);
  });

  it("level 1 grants disadvantage on ability checks only", () => {
    expect(buildRollModifiers(exhaustion(1), noEffects)).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
    ]);
  });

  it("level 2 still only grants disadvantage on ability checks (speed halved isn't a roll effect)", () => {
    expect(buildRollModifiers(exhaustion(2), noEffects)).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
    ]);
  });

  it("level 3 adds disadvantage on attack rolls + saving throws, cumulative with checks", () => {
    expect(buildRollModifiers(exhaustion(3), noEffects)).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
      { mode: "disadvantage", kind: "save", source: "Exhaustion" },
    ]);
  });

  it("level 6 (death) still carries the level-3 roll effects", () => {
    expect(buildRollModifiers(exhaustion(6), noEffects)).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
      { mode: "disadvantage", kind: "save", source: "Exhaustion" },
    ]);
  });

  it("merges exhaustion effects with an active condition's effects", () => {
    const state: ConditionsMutableState = {
      active: [{ key: "poisoned" as never, appliedAt: "2026-01-01T00:00:00.000Z" }],
      exhaustion: 1,
    };
    const mods = buildRollModifiers(state, noEffects);
    expect(mods.map((m) => m.source)).toEqual(["Poisoned", "Poisoned", "Exhaustion"]);
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
