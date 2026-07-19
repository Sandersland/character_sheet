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
    expect(r).toEqual({ mode: "normal", modifier: 0, sources: [] });
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
    // The adv/dis grants are overridden away; only the flat penalty's source remains.
    expect(r.sources.map((s) => s.source)).toEqual(["Exhaustion"]);
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
