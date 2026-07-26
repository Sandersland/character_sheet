import { describe, expect, it } from "vitest";

import { exhaustionRollEffects, exhaustionSpeedPenalty } from "@/lib/srd/condition-data.js";

// SRD 5.2: each exhaustion level reduces Speed by 5 ft (−5 ft×level).
describe("exhaustionSpeedPenalty — 2024 (SRD 5.2, #1136)", () => {
  it("is 0 at level 0", () => {
    expect(exhaustionSpeedPenalty(0, 30, "EDITION_2024")).toBe(0);
  });

  it("is −5 ft per level", () => {
    expect(exhaustionSpeedPenalty(1, 30, "EDITION_2024")).toBe(5);
    expect(exhaustionSpeedPenalty(3, 30, "EDITION_2024")).toBe(15);
    expect(exhaustionSpeedPenalty(6, 30, "EDITION_2024")).toBe(30);
  });

  it("never goes negative for a stray sub-zero level", () => {
    expect(exhaustionSpeedPenalty(-2, 30, "EDITION_2024")).toBe(0);
  });
});

// PHB'14 p. 291 (Appendix A), cumulative tiers: 1 disadvantage on ability
// checks, 2 +speed halved, 3 +disadvantage on attacks/saves, 4 +HP max halved
// (out of scope, #1307), 5 +speed 0, 6 death.
describe("exhaustionSpeedPenalty — 2014 (PHB'14 p. 291)", () => {
  it("level 0 or 1: no Speed penalty yet", () => {
    expect(exhaustionSpeedPenalty(0, 30, "EDITION_2014")).toBe(0);
    expect(exhaustionSpeedPenalty(1, 30, "EDITION_2014")).toBe(0);
  });

  it("levels 2-4: subtracts ceil(currentSpeed/2), so the RESULT (currentSpeed − penalty) is floor(currentSpeed/2) — half, rounded down, matching Prone's round-down convention", () => {
    expect(exhaustionSpeedPenalty(2, 25, "EDITION_2014")).toBe(13);
    expect(exhaustionSpeedPenalty(3, 25, "EDITION_2014")).toBe(13);
    expect(exhaustionSpeedPenalty(4, 25, "EDITION_2014")).toBe(13);
    expect(25 - exhaustionSpeedPenalty(2, 25, "EDITION_2014")).toBe(12);

    // Even current speed (30): ceil and floor agree, pinning the direction
    // from both sides — the result is still exactly half.
    expect(exhaustionSpeedPenalty(2, 30, "EDITION_2014")).toBe(15);
    expect(30 - exhaustionSpeedPenalty(2, 30, "EDITION_2014")).toBe(15);
  });

  it("level 5+: Speed reduced to exactly 0 — a floor on currentSpeed, not currentSpeed - 5", () => {
    expect(exhaustionSpeedPenalty(5, 40, "EDITION_2014")).toBe(40);
    expect(exhaustionSpeedPenalty(6, 40, "EDITION_2014")).toBe(40);
  });

  it("never goes negative for a stray sub-zero level", () => {
    expect(exhaustionSpeedPenalty(-2, 30, "EDITION_2014")).toBe(0);
  });

  it("a currentSpeed of 0 stays a no-op penalty (nothing left to floor)", () => {
    expect(exhaustionSpeedPenalty(5, 0, "EDITION_2014")).toBe(0);
  });
});

describe("exhaustionRollEffects — 2024 (SRD 5.2, #1136)", () => {
  it("level 0 grants no roll effects", () => {
    expect(exhaustionRollEffects(0, "EDITION_2024")).toEqual([]);
  });

  it("is a flat −2×level on every d20 Test (attack/check/save/initiative)", () => {
    expect(exhaustionRollEffects(1, "EDITION_2024")).toEqual([
      { mode: "flat", modifier: -2, kind: "attack" },
      { mode: "flat", modifier: -2, kind: "check" },
      { mode: "flat", modifier: -2, kind: "save" },
      { mode: "flat", modifier: -2, kind: "initiative" },
    ]);
    expect(exhaustionRollEffects(3, "EDITION_2024")).toEqual([
      { mode: "flat", modifier: -6, kind: "attack" },
      { mode: "flat", modifier: -6, kind: "check" },
      { mode: "flat", modifier: -6, kind: "save" },
      { mode: "flat", modifier: -6, kind: "initiative" },
    ]);
  });
});

describe("exhaustionRollEffects — 2014 (PHB'14 p. 291)", () => {
  it("level 0: no roll effects", () => {
    expect(exhaustionRollEffects(0, "EDITION_2014")).toEqual([]);
  });

  it("level 1: disadvantage on ability checks — including Initiative, a Dex check (PHB'14 p. 189)", () => {
    expect(exhaustionRollEffects(1, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
    ]);
  });

  it("level 2: still only the tier-1 grant (Speed-halved has no roll effect)", () => {
    expect(exhaustionRollEffects(2, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
    ]);
  });

  it("level 3: cumulative — adds disadvantage on attack rolls and saving throws", () => {
    expect(exhaustionRollEffects(3, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "save" },
    ]);
  });

  it("level 6 (death): the tier-3 grant persists — no new roll effect is added by death itself", () => {
    expect(exhaustionRollEffects(6, "EDITION_2014")).toEqual([
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "save" },
    ]);
  });

  it("a stray sub-zero level grants nothing", () => {
    expect(exhaustionRollEffects(-2, "EDITION_2014")).toEqual([]);
  });
});
