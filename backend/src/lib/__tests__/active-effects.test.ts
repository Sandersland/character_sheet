import { describe, expect, it } from "vitest";

import {
  buffsByTarget,
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
  type ActiveEffectsMutableState,
} from "../active-effects.js";
import { readEffectSpec, resolveBuffSpec, type EffectRow } from "../effects.js";

describe("normalizeActiveEffectsMutable", () => {
  it("returns an empty buff list for null / non-object input", () => {
    expect(normalizeActiveEffectsMutable(null)).toEqual({ buffs: [] });
    expect(normalizeActiveEffectsMutable([] as never)).toEqual({ buffs: [] });
  });

  it("drops malformed buff entries and coerces the modifier to an integer", () => {
    const state = normalizeActiveEffectsMutable({
      buffs: [
        { id: "a", key: "guidance", target: "athletics", modifier: 4, source: "Guidance", sourceEntryId: "e1" },
        { key: "bad", modifier: 2 }, // missing target
        { key: "nan", target: "arcana", modifier: "x" }, // non-numeric
        { key: "floaty", target: "insight", modifier: 2.9, source: "X" },
      ],
    });
    expect(state.buffs).toHaveLength(2);
    expect(state.buffs[0]).toMatchObject({ key: "guidance", target: "athletics", modifier: 4, sourceEntryId: "e1" });
    expect(state.buffs[1]).toMatchObject({ key: "floaty", target: "insight", modifier: 2 });
  });

  it("round-trips through serialize", () => {
    const state: ActiveEffectsMutableState = {
      buffs: [{ id: "a", key: "k", target: "stealth", modifier: 3, source: "Pass without Trace", sourceEntryId: "e9" }],
    };
    const serialized = JSON.parse(JSON.stringify(serializeActiveEffectsState(state)));
    expect(normalizeActiveEffectsMutable(serialized)).toEqual(state);
  });
});

describe("buffsByTarget", () => {
  it("groups buffs by target key", () => {
    const grouped = buffsByTarget({
      buffs: [
        { id: "1", key: "a", target: "athletics", modifier: 2, source: "A" },
        { id: "2", key: "b", target: "athletics", modifier: 1, source: "B" },
        { id: "3", key: "c", target: "stealth", modifier: 5, source: "C" },
      ],
    });
    expect(grouped.athletics.map((b) => b.modifier)).toEqual([2, 1]);
    expect(grouped.stealth).toHaveLength(1);
  });
});

describe("readEffectSpec + resolveBuffSpec", () => {
  const guidance: EffectRow = { level: 0, effectKind: "buff", buffTarget: "athletics", buffModifier: 4 };

  it("reads a buff EffectSpec from the flat columns", () => {
    const spec = readEffectSpec(guidance);
    expect(spec.effectType).toBe("buff");
    expect(spec.buffTarget).toBe("athletics");
    expect(spec.buffModifier).toBe(4);
    expect(spec.dice).toBeUndefined();
  });

  it("resolves a buff descriptor instead of coercing to utility", () => {
    expect(resolveBuffSpec(readEffectSpec(guidance))).toEqual({ target: "athletics", modifier: 4 });
  });

  it("returns null for a non-buff spec", () => {
    const utility: EffectRow = { level: 1 };
    expect(resolveBuffSpec(readEffectSpec(utility))).toBeNull();
  });
});
