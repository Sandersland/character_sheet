import { describe, expect, it } from "vitest";

import {
  activeResistedDamageTypes,
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

  it("defaults a legacy (duration-less) buff to concentration", () => {
    const state = normalizeActiveEffectsMutable({
      buffs: [{ id: "a", key: "guidance", target: "athletics", modifier: 4, source: "Guidance", sourceEntryId: "e1" }],
    });
    expect(state.buffs[0].duration).toBe("concentration");
    expect(state.buffs[0].restType).toBeUndefined();
  });

  it("preserves a valid duration + restType and falls back to concentration for a bad duration", () => {
    const state = normalizeActiveEffectsMutable({
      buffs: [
        { id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "until-rest", restType: "long" },
        { id: "w", key: "hex", target: "athletics", modifier: 1, source: "Hex", duration: "while-active" },
        { id: "x", key: "bogus", target: "arcana", modifier: 1, source: "X", duration: "forever" },
      ],
    });
    expect(state.buffs[0]).toMatchObject({ duration: "until-rest", restType: "long", target: "meleeDamage" });
    expect(state.buffs[1]).toMatchObject({ duration: "while-active" });
    expect(state.buffs[1].restType).toBeUndefined();
    expect(state.buffs[2].duration).toBe("concentration");
  });

  it("round-trips through serialize", () => {
    const state: ActiveEffectsMutableState = {
      buffs: [
        { id: "a", key: "k", target: "stealth", modifier: 3, source: "Pass without Trace", sourceEntryId: "e9", duration: "concentration" },
        { id: "b", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "until-rest", restType: "long" },
      ],
    };
    const serialized = JSON.parse(JSON.stringify(serializeActiveEffectsState(state)));
    expect(normalizeActiveEffectsMutable(serialized)).toEqual(state);
  });

  it("serializes a concentration buff with byte-parity (no duration / restType keys)", () => {
    const state: ActiveEffectsMutableState = {
      buffs: [{ id: "a", key: "k", target: "stealth", modifier: 3, source: "Pass without Trace", sourceEntryId: "e9", duration: "concentration" }],
    };
    const serialized = JSON.parse(JSON.stringify(serializeActiveEffectsState(state))) as { buffs: Record<string, unknown>[] };
    expect(Object.keys(serialized.buffs[0])).toEqual(["id", "key", "target", "modifier", "source", "sourceEntryId"]);
  });

  it("serializes durable buffs with their duration (and restType when set)", () => {
    const state: ActiveEffectsMutableState = {
      buffs: [{ id: "b", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "until-rest", restType: "long" }],
    };
    const serialized = JSON.parse(JSON.stringify(serializeActiveEffectsState(state))) as { buffs: Record<string, unknown>[] };
    expect(serialized.buffs[0]).toMatchObject({ duration: "until-rest", restType: "long" });
  });

  it("round-trips resistDamageTypes and drops an empty/malformed list (#456)", () => {
    const state: ActiveEffectsMutableState = {
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active", resistDamageTypes: ["bludgeoning", "piercing", "slashing"] }],
    };
    const serialized = JSON.parse(JSON.stringify(serializeActiveEffectsState(state)));
    expect(normalizeActiveEffectsMutable(serialized)).toEqual(state);
    // Malformed entries are filtered; an empty list is omitted entirely.
    const cleaned = normalizeActiveEffectsMutable({
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active", resistDamageTypes: ["fire", 5, null] }],
    });
    expect(cleaned.buffs[0].resistDamageTypes).toEqual(["fire"]);
    const noneLeft = normalizeActiveEffectsMutable({
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active", resistDamageTypes: [] }],
    });
    expect(noneLeft.buffs[0].resistDamageTypes).toBeUndefined();
  });
});

describe("activeResistedDamageTypes (#456)", () => {
  it("unions resistDamageTypes across active buffs; empty when none declare any", () => {
    expect(activeResistedDamageTypes({ buffs: [] })).toEqual(new Set());
    const state: ActiveEffectsMutableState = {
      buffs: [
        { id: "1", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active", resistDamageTypes: ["bludgeoning", "piercing", "slashing"] },
        { id: "2", key: "stoneskin", target: "athletics", modifier: 0, source: "Stoneskin", duration: "concentration", resistDamageTypes: ["piercing"] },
        { id: "3", key: "bless", target: "athletics", modifier: 1, source: "Bless", duration: "concentration" },
      ],
    };
    expect(activeResistedDamageTypes(state)).toEqual(new Set(["bludgeoning", "piercing", "slashing"]));
  });
});

describe("buffsByTarget", () => {
  it("groups buffs by target key", () => {
    const grouped = buffsByTarget({
      buffs: [
        { id: "1", key: "a", target: "athletics", modifier: 2, source: "A", duration: "concentration" },
        { id: "2", key: "b", target: "athletics", modifier: 1, source: "B", duration: "concentration" },
        { id: "3", key: "c", target: "stealth", modifier: 5, source: "C", duration: "concentration" },
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
