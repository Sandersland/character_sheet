import { describe, expect, it } from "vitest";

import { resolveRollMode, rollModeChip } from "@/lib/rollMode";
import type { RollModifier } from "@/types/character";

const rage: RollModifier[] = [
  { mode: "advantage", kind: "check", ability: "strength", source: "Rage" },
  { mode: "advantage", kind: "save", ability: "strength", source: "Rage" },
];
const poisoned: RollModifier[] = [
  { mode: "disadvantage", kind: "attack", source: "Poisoned" },
  { mode: "disadvantage", kind: "check", source: "Poisoned" },
];

describe("resolveRollMode (#486)", () => {
  it("grants advantage on a Strength check while raging, sourced to Rage", () => {
    const r = resolveRollMode(rage, { kind: "check", ability: "strength" });
    expect(r.mode).toBe("advantage");
    expect(r.sources.map((s) => s.source)).toEqual(["Rage"]);
  });

  it("grants advantage on a Strength save while raging", () => {
    expect(resolveRollMode(rage, { kind: "save", ability: "strength" }).mode).toBe("advantage");
  });

  it("does NOT apply an ability-scoped grant to a different ability", () => {
    const r = resolveRollMode(rage, { kind: "check", ability: "dexterity" });
    expect(r.mode).toBe("normal");
    expect(r.sources).toEqual([]);
  });

  it("applies an ability-agnostic disadvantage (Poisoned) to any ability check", () => {
    expect(resolveRollMode(poisoned, { kind: "check", ability: "wisdom" }).mode).toBe("disadvantage");
    expect(resolveRollMode(poisoned, { kind: "attack" }).mode).toBe("disadvantage");
  });

  it("does not leak a check-scoped disadvantage onto a save", () => {
    expect(resolveRollMode(poisoned, { kind: "save", ability: "strength" }).mode).toBe("normal");
  });

  it("cancels advantage + disadvantage from different sources to normal (RAW)", () => {
    // Rage advantage on STR check + Poisoned disadvantage on any check → neither.
    const r = resolveRollMode([...rage, ...poisoned], { kind: "check", ability: "strength" });
    expect(r.mode).toBe("normal");
    expect(r.sources.map((s) => s.source).sort()).toEqual(["Poisoned", "Rage"]);
  });

  it("lets the manual toggle override the auto mode (advantage over auto-disadvantage)", () => {
    const r = resolveRollMode(poisoned, { kind: "attack" }, "advantage");
    expect(r.mode).toBe("advantage");
    expect(r.sources).toEqual([]);
  });

  it("lets the manual toggle override the auto mode (disadvantage over auto-advantage)", () => {
    expect(resolveRollMode(rage, { kind: "check", ability: "strength" }, "disadvantage").mode).toBe("disadvantage");
  });

  it("returns normal + no sources when no state applies", () => {
    const r = resolveRollMode([], { kind: "initiative" });
    expect(r).toEqual({ mode: "normal", sources: [] });
  });
});

describe("rollModeChip (#486)", () => {
  it("summarizes the applied source", () => {
    const r = resolveRollMode(poisoned, { kind: "attack" });
    expect(rollModeChip(r)).toBe("disadvantage — Poisoned");
  });

  it("dedupes repeated source names", () => {
    const r = resolveRollMode(rage, { kind: "check", ability: "strength" });
    expect(rollModeChip(r)).toBe("advantage — Rage");
  });

  it("is empty when nothing applied or on a manual override", () => {
    expect(rollModeChip(resolveRollMode([], { kind: "attack" }))).toBe("");
    expect(rollModeChip(resolveRollMode(poisoned, { kind: "attack" }, "advantage"))).toBe("");
  });
});
