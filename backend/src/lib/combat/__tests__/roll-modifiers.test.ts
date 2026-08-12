import { describe, expect, it } from "vitest";

import { buildRollModifiers } from "@/lib/character/character-serialize.js";
import {
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
} from "@/lib/combat/active-effects.js";
import type { ConditionsMutableState } from "@/lib/combat/conditions.js";
import type { ActiveEffectsMutableState } from "@/lib/combat/active-effects.js";

const noConditions: ConditionsMutableState = { active: [], exhaustion: 0, suspended: [] };
const noEffects: ActiveEffectsMutableState = { buffs: [] };

function condition(key: string): ConditionsMutableState {
  return { active: [{ key: key as never, appliedAt: "2026-01-01T00:00:00.000Z" }], exhaustion: 0, suspended: [] };
}

describe("buildRollModifiers (#486)", () => {
  it("emits Poisoned's disadvantage on attacks + ability checks + initiative (a Dex check), sourced to the label", () => {
    const mods = buildRollModifiers(condition("poisoned"), noEffects, "EDITION_2024");
    expect(mods).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Poisoned" },
      { mode: "disadvantage", kind: "check", source: "Poisoned" },
      { mode: "disadvantage", kind: "initiative", source: "Poisoned" },
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
    expect(buildRollModifiers(noConditions, effects, "EDITION_2024")).toEqual([
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
    const mods = buildRollModifiers(condition("poisoned"), effects, "EDITION_2024");
    expect(mods).toHaveLength(4);
    expect(mods.map((m) => m.source)).toEqual(["Poisoned", "Poisoned", "Poisoned", "Rage"]);
  });

  it("returns [] when no active state grants a roll effect", () => {
    expect(buildRollModifiers(condition("charmed"), noEffects, "EDITION_2024")).toEqual([]);
    expect(buildRollModifiers(noConditions, noEffects, "EDITION_2024")).toEqual([]);
  });

  it("emits Prone's disadvantage on attack rolls, sourced to the label", () => {
    expect(buildRollModifiers(condition("prone"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Prone" },
    ]);
  });

  it("emits Restrained's disadvantage on attacks + Dexterity saves", () => {
    expect(buildRollModifiers(condition("restrained"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Restrained" },
      { mode: "disadvantage", kind: "save", ability: "dexterity", source: "Restrained" },
    ]);
  });

  it("emits Blinded's disadvantage on attack rolls", () => {
    expect(buildRollModifiers(condition("blinded"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Blinded" },
    ]);
  });

  it("emits Frightened's disadvantage on attacks + ability checks + initiative (a Dex check)", () => {
    expect(buildRollModifiers(condition("frightened"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Frightened" },
      { mode: "disadvantage", kind: "check", source: "Frightened" },
      { mode: "disadvantage", kind: "initiative", source: "Frightened" },
    ]);
  });

  it("emits Grappled's disadvantage on attacks (vs targets other than the grappler)", () => {
    expect(buildRollModifiers(condition("grappled"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Grappled" },
    ]);
  });

  it("emits Invisible's advantage on initiative + attack rolls (2024)", () => {
    expect(buildRollModifiers(condition("invisible"), noEffects, "EDITION_2024")).toEqual([
      { mode: "advantage", kind: "initiative", source: "Invisible" },
      { mode: "advantage", kind: "attack", source: "Invisible" },
    ]);
  });

  it("emits Incapacitated's disadvantage on initiative (2024 Surprised)", () => {
    expect(buildRollModifiers(condition("incapacitated"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Incapacitated" },
    ]);
  });

  it("flattens Incapacitated's initiative disadvantage onto Paralyzed", () => {
    expect(buildRollModifiers(condition("paralyzed"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Paralyzed" },
    ]);
  });

  it("flattens Incapacitated's initiative disadvantage onto Stunned", () => {
    expect(buildRollModifiers(condition("stunned"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Stunned" },
    ]);
  });

  it("flattens Incapacitated's initiative disadvantage onto Petrified", () => {
    expect(buildRollModifiers(condition("petrified"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Petrified" },
    ]);
  });

  it("flattens Incapacitated + Prone effects onto Unconscious", () => {
    expect(buildRollModifiers(condition("unconscious"), noEffects, "EDITION_2024")).toEqual([
      { mode: "disadvantage", kind: "initiative", source: "Unconscious" },
      { mode: "disadvantage", kind: "attack", source: "Unconscious" },
    ]);
  });
});

// #1309: the 2014 half of what #1135 replaced. Only the 9 conditions with a
// real PHB'14 delta are asserted here — the other 5 are byte-identical and
// already covered by the EDITION_2024 tests above (same shared row).
describe("buildRollModifiers — 2014 divergent conditions (#1309, PHB'14 pp. 290-292 Appendix A)", () => {
  it("charmed: no roll effects (description-only divergence, same as 2024)", () => {
    expect(buildRollModifiers(condition("charmed"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("grappled: no roll effects (2024 grants disadvantage on attack, 2014 does not)", () => {
    expect(buildRollModifiers(condition("grappled"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("incapacitated: no roll effects (2024 grants disadvantage on initiative, 2014 does not)", () => {
    expect(buildRollModifiers(condition("incapacitated"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("invisible: advantage on attack only — no initiative grant (2024 adds initiative too)", () => {
    expect(buildRollModifiers(condition("invisible"), noEffects, "EDITION_2014")).toEqual([
      { mode: "advantage", kind: "attack", source: "Invisible" },
    ]);
  });

  it("paralyzed: no roll effects (2024 flattens Incapacitated's initiative disadvantage onto it)", () => {
    expect(buildRollModifiers(condition("paralyzed"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("petrified: no roll effects (2024 flattens Incapacitated's initiative disadvantage onto it)", () => {
    expect(buildRollModifiers(condition("petrified"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("prone: disadvantage on attack, same as 2024 (description-only divergence)", () => {
    expect(buildRollModifiers(condition("prone"), noEffects, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Prone" },
    ]);
  });

  it("stunned: no roll effects (2024 flattens Incapacitated's initiative disadvantage onto it)", () => {
    expect(buildRollModifiers(condition("stunned"), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("unconscious: disadvantage on attack from Prone (2014 Incapacitated has no initiative grant to flatten, unlike 2024)", () => {
    expect(buildRollModifiers(condition("unconscious"), noEffects, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "attack", source: "Unconscious" },
    ]);
  });
});

describe("buildRollModifiers exhaustion — 2024 flat penalty (#1136)", () => {
  function exhaustion(level: number): ConditionsMutableState {
    return { active: [], exhaustion: level, suspended: [] };
  }

  // 2024 (SRD 5.2): each exhaustion level is a flat −2 to every d20 Test —
  // attack rolls, ability checks, saving throws, and Initiative (a Dex check).
  function flatAtLevel(level: number) {
    const modifier = -2 * level;
    return (["attack", "check", "save", "initiative"] as const).map((kind) => ({
      mode: "flat",
      modifier,
      kind,
      source: "Exhaustion",
    }));
  }

  it("level 0 grants no roll effects", () => {
    expect(buildRollModifiers(exhaustion(0), noEffects, "EDITION_2024")).toEqual([]);
  });

  it("level 1 grants a flat −2 on every d20 Test (attack/check/save/initiative)", () => {
    expect(buildRollModifiers(exhaustion(1), noEffects, "EDITION_2024")).toEqual(flatAtLevel(1));
  });

  it("level 3 grants a flat −6 on every d20 Test", () => {
    expect(buildRollModifiers(exhaustion(3), noEffects, "EDITION_2024")).toEqual(flatAtLevel(3));
  });

  it("level 6 (death) grants a flat −12 on every d20 Test", () => {
    expect(buildRollModifiers(exhaustion(6), noEffects, "EDITION_2024")).toEqual(flatAtLevel(6));
  });

  it("merges exhaustion effects with an active condition's effects", () => {
    const state: ConditionsMutableState = {
      active: [{ key: "poisoned" as never, appliedAt: "2026-01-01T00:00:00.000Z" }],
      exhaustion: 1,
      suspended: [],
    };
    const mods = buildRollModifiers(state, noEffects, "EDITION_2024");
    expect(mods.map((m) => m.source)).toEqual([
      "Poisoned",
      "Poisoned",
      "Poisoned",
      "Exhaustion",
      "Exhaustion",
      "Exhaustion",
      "Exhaustion",
    ]);
  });
});

// #1307: the 2014 half of what #1136 replaced. A persisted exhaustion level's
// *meaning* forks on Character.rulesEdition — same stored number, different
// roll effects — so both editions are asserted here side by side.
describe("buildRollModifiers exhaustion — 2014 tiered disadvantage (#1307, PHB'14 p. 291)", () => {
  function exhaustion(level: number): ConditionsMutableState {
    return { active: [], exhaustion: level, suspended: [] };
  }

  it("level 0 grants no roll effects", () => {
    expect(buildRollModifiers(exhaustion(0), noEffects, "EDITION_2014")).toEqual([]);
  });

  it("level 1 grants disadvantage on ability checks and Initiative (a Dex check, PHB'14 p. 189)", () => {
    expect(buildRollModifiers(exhaustion(1), noEffects, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
    ]);
  });

  it("level 3 (matching the 2024 flat-penalty test above at the same level) adds disadvantage on attacks and saves", () => {
    expect(buildRollModifiers(exhaustion(3), noEffects, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
      { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
      { mode: "disadvantage", kind: "save", source: "Exhaustion" },
    ]);
  });

  it("level 6 (death) keeps the tier-3 grant — no new roll effect from death itself", () => {
    expect(buildRollModifiers(exhaustion(6), noEffects, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check", source: "Exhaustion" },
      { mode: "disadvantage", kind: "initiative", source: "Exhaustion" },
      { mode: "disadvantage", kind: "attack", source: "Exhaustion" },
      { mode: "disadvantage", kind: "save", source: "Exhaustion" },
    ]);
  });

  it("merges exhaustion effects with an active condition's effects", () => {
    const state: ConditionsMutableState = {
      active: [{ key: "poisoned" as never, appliedAt: "2026-01-01T00:00:00.000Z" }],
      exhaustion: 1,
      suspended: [],
    };
    const mods = buildRollModifiers(state, noEffects, "EDITION_2014");
    expect(mods.map((m) => m.source)).toEqual([
      "Poisoned",
      "Poisoned",
      "Poisoned",
      "Exhaustion",
      "Exhaustion",
    ]);
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
