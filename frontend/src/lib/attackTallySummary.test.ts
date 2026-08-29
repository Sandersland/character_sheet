import { describe, expect, it } from "vitest";

import {
  attackTallyLine,
  attackTallyLines,
  autoVerdict,
  isCritRow,
  isMissRow,
  isVerdictLocked,
  type AttackTallyRow,
  type TallyAttackRoll,
} from "@/lib/attackTallySummary";

function roll(overrides: Partial<TallyAttackRoll> = {}): TallyAttackRoll {
  return { total: 17, keptFace: 14, nat20: false, nat1: false, criticalHit: false, ...overrides };
}

function row(overrides: Partial<AttackTallyRow> = {}): AttackTallyRow {
  return { id: "r1", source: "action", formId: "w1", formName: "Longsword", attack: roll(), ...overrides };
}

describe("autoVerdict", () => {
  it("a crit-range hit → crit (a plain nat 20 is the default-range case, #1120)", () => {
    expect(autoVerdict(roll({ nat20: true, criticalHit: true }))).toBe("crit");
  });

  it("nat 1 → miss", () => {
    expect(autoVerdict(roll({ nat1: true }))).toBe("miss");
  });

  it("any other roll → undefined (manual)", () => {
    expect(autoVerdict(roll())).toBeUndefined();
  });

  // Unreachable via useAttackRolls today, but autoVerdict must key off criticalHit, not nat20, or a future critRange > 20 caller would regress to the old nat20-only rule (#1120).
  it("nat20 alone (criticalHit false) does not auto-crit", () => {
    expect(autoVerdict(roll({ nat20: true, criticalHit: false }))).toBeUndefined();
  });

  it("a natural 19 within a widened crit range (Champion L3) auto-crits", () => {
    expect(autoVerdict(roll({ keptFace: 19, nat20: false, criticalHit: true }))).toBe("crit");
  });
});

describe("verdict predicates", () => {
  it("isVerdictLocked is true for a crit-range hit or nat 1 row, false otherwise", () => {
    expect(isVerdictLocked(row({ attack: roll({ nat20: true, criticalHit: true }) }))).toBe(true);
    expect(isVerdictLocked(row({ attack: roll({ nat1: true }) }))).toBe(true);
    expect(isVerdictLocked(row())).toBe(false);
  });

  it("isMissRow only for an explicit miss verdict", () => {
    expect(isMissRow(row({ verdict: "miss" }))).toBe(true);
    expect(isMissRow(row({ verdict: "hit" }))).toBe(false);
    expect(isMissRow(row())).toBe(false);
  });

  it("isCritRow for an explicit crit verdict OR a crit-range hit", () => {
    expect(isCritRow(row({ verdict: "crit" }))).toBe(true);
    expect(isCritRow(row({ attack: roll({ nat20: true, criticalHit: true }) }))).toBe(true);
    expect(isCritRow(row())).toBe(false);
  });

  it("isCritRow is true on a Champion's widened-range hit (nat 19) with no nat20", () => {
    expect(isCritRow(row({ attack: roll({ keptFace: 19, criticalHit: true }) }))).toBe(true);
  });
});

describe("attackTallyLine", () => {
  it("nat 1 miss line reads 'nat 1 — miss'", () => {
    const line = attackTallyLine(row({ attack: roll({ nat1: true }), verdict: "miss", damage: 9 }));
    expect(line).toBe("Longsword: nat 1 — miss");
  });

  it("explicit (non-nat-1) miss shows the to-hit and drops damage", () => {
    const line = attackTallyLine(row({ verdict: "miss", damage: 12 }));
    expect(line).toBe("Longsword: miss (to-hit 17)");
  });

  it("hit line carries the to-hit total and damage", () => {
    const line = attackTallyLine(row({ verdict: "hit", damage: 11 }));
    expect(line).toBe("Longsword: hit — to-hit 17 — 11 damage");
  });

  it("crit line says crit! and shows damage", () => {
    const line = attackTallyLine(row({ attack: roll({ nat20: true, total: 25 }), verdict: "crit", damage: 18 }));
    expect(line).toBe("Longsword: crit! (to-hit 25) — 18 damage");
  });

  it("hit with no damage yet prompts to roll damage", () => {
    const line = attackTallyLine(row({ verdict: "hit" }));
    expect(line).toBe("Longsword: hit — to-hit 17 — roll damage");
  });

  it("an unresolved row asks the question — never claims a hit (#811)", () => {
    const line = attackTallyLine(row({}));
    expect(line).toBe("Longsword: to-hit 17 — hit or miss?");
  });

  it("an unresolved row with damage recorded still asks (damage does not imply hit here — state auto-resolves it upstream)", () => {
    const line = attackTallyLine(row({ damage: 9 }));
    expect(line).toBe("Longsword: to-hit 17 — hit or miss?");
  });

  it("attackTallyLines maps one line per row", () => {
    const lines = attackTallyLines([
      row({ verdict: "hit", damage: 8 }),
      row({ formName: "Dagger", attack: roll({ nat1: true }), verdict: "miss" }),
    ]);
    expect(lines).toEqual(["Longsword: hit — to-hit 17 — 8 damage", "Dagger: nat 1 — miss"]);
  });
});
