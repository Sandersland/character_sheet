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
  { mode: "disadvantage", kind: "initiative", source: "Poisoned" },
];
// 2024 exhaustion level 2: a flat −4 on every d20 Test (#1136).
const exhaustion2: RollModifier[] = [
  { mode: "flat", modifier: -4, kind: "attack", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "check", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "save", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "initiative", source: "Exhaustion" },
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
    expect(r).toEqual({ mode: "normal", modifier: 0, sources: [] });
  });

  it("does NOT apply Rage's Strength-check advantage to an Initiative roll", () => {
    const r = resolveRollMode(rage, { kind: "initiative" });
    expect(r.mode).toBe("normal");
    expect(r.sources).toEqual([]);
  });

  it("applies an explicit initiative disadvantage grant (Poisoned, #1327)", () => {
    expect(resolveRollMode(poisoned, { kind: "initiative" }).mode).toBe("disadvantage");
  });
});

describe("resolveRollMode flat modifiers (#1136)", () => {
  it("sums a flat penalty into `modifier` without touching the mode", () => {
    const r = resolveRollMode(exhaustion2, { kind: "attack" });
    expect(r.mode).toBe("normal");
    expect(r.modifier).toBe(-4);
  });

  it("applies the flat penalty on a save (initiative subsumed as a Dex check elsewhere)", () => {
    expect(resolveRollMode(exhaustion2, { kind: "save", ability: "wisdom" }).modifier).toBe(-4);
  });

  it("carries the flat penalty alongside a disadvantage mode from another source", () => {
    const r = resolveRollMode([...exhaustion2, ...poisoned], { kind: "attack" });
    expect(r.mode).toBe("disadvantage");
    expect(r.modifier).toBe(-4);
  });

  it("keeps the flat penalty through a manual override (override only flips the adv/dis axis)", () => {
    const r = resolveRollMode([...exhaustion2, ...poisoned], { kind: "attack" }, "advantage");
    expect(r.mode).toBe("advantage");
    expect(r.modifier).toBe(-4);
    expect(r.sources.map((s) => s.source)).toEqual(["Exhaustion"]);
  });

  // Regression guard (#1327): if `applies` let a `check` grant match initiative, `sumFlat` would double-count exhaustion and return −8, not −4.
  it("applies the flat exhaustion penalty to Initiative exactly once (−2×level, not doubled)", () => {
    expect(resolveRollMode(exhaustion2, { kind: "initiative" }).modifier).toBe(-4);
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

  it("is empty when nothing applied or on a manual override with no flat penalty", () => {
    expect(rollModeChip(resolveRollMode([], { kind: "attack" }))).toBe("");
    expect(rollModeChip(resolveRollMode(poisoned, { kind: "attack" }, "advantage"))).toBe("");
  });

  it("renders a flat penalty with no mode word (#1136)", () => {
    expect(rollModeChip(resolveRollMode(exhaustion2, { kind: "attack" }))).toBe("−4 — Exhaustion");
  });

  it("renders mode and flat penalty together (#1136)", () => {
    expect(rollModeChip(resolveRollMode([...poisoned, ...exhaustion2], { kind: "attack" }))).toBe(
      "disadvantage −4 — Poisoned, Exhaustion",
    );
  });
});
