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
  return { total: 17, keptFace: 14, nat20: false, nat1: false, ...overrides };
}

function row(overrides: Partial<AttackTallyRow> = {}): AttackTallyRow {
  return { id: "r1", source: "action", formId: "w1", formName: "Longsword", attack: roll(), ...overrides };
}

describe("autoVerdict", () => {
  it("nat 20 → crit", () => {
    expect(autoVerdict(roll({ nat20: true }))).toBe("crit");
  });

  it("nat 1 → miss", () => {
    expect(autoVerdict(roll({ nat1: true }))).toBe("miss");
  });

  it("any other roll → undefined (manual)", () => {
    expect(autoVerdict(roll())).toBeUndefined();
  });
});

describe("verdict predicates", () => {
  it("isVerdictLocked is true for a nat 20 or nat 1 row, false otherwise", () => {
    expect(isVerdictLocked(row({ attack: roll({ nat20: true }) }))).toBe(true);
    expect(isVerdictLocked(row({ attack: roll({ nat1: true }) }))).toBe(true);
    expect(isVerdictLocked(row())).toBe(false);
  });

  it("isMissRow only for an explicit miss verdict", () => {
    expect(isMissRow(row({ verdict: "miss" }))).toBe(true);
    expect(isMissRow(row({ verdict: "hit" }))).toBe(false);
    expect(isMissRow(row())).toBe(false); // unset → treated as a hit
  });

  it("isCritRow for an explicit crit verdict OR a nat 20", () => {
    expect(isCritRow(row({ verdict: "crit" }))).toBe(true);
    expect(isCritRow(row({ attack: roll({ nat20: true }) }))).toBe(true);
    expect(isCritRow(row())).toBe(false);
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
