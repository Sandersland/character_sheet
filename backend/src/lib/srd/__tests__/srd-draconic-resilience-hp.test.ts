import { describe, it, expect } from "vitest";

import { draconicResilienceMaxHpBonus } from "@/lib/srd/srd.js";

// PHB'14 p.106: subclassLevel 1 (Sorcerous Origin at 1st level, the seeded
// Sorcerer catalog value) is EDITION_2014's real gate; EDITION_2024 always
// gates at 3 regardless of subclassLevel (subclassGateLevel's own rule).
describe("draconicResilienceMaxHpBonus (#1123)", () => {
  describe("2014 — flat +1/sorcerer level from L1", () => {
    it("L1 → +1", () => {
      expect(draconicResilienceMaxHpBonus(1, 1, "EDITION_2014")).toBe(1);
    });

    it("L5 → +5", () => {
      expect(draconicResilienceMaxHpBonus(5, 1, "EDITION_2014")).toBe(5);
    });

    it("L20 → +20", () => {
      expect(draconicResilienceMaxHpBonus(20, 1, "EDITION_2014")).toBe(20);
    });
  });

  describe("2024 — +3 at L3, then +1/level thereafter", () => {
    it("L2 → +0 (feature not yet granted — the missing-level-gate case)", () => {
      expect(draconicResilienceMaxHpBonus(2, 1, "EDITION_2024")).toBe(0);
    });

    it("L3 → +3", () => {
      expect(draconicResilienceMaxHpBonus(3, 1, "EDITION_2024")).toBe(3);
    });

    it("L5 → +5 (3 at L3, +1 at L4, +1 at L5 — equal to 2014's total here, by coincidence)", () => {
      expect(draconicResilienceMaxHpBonus(5, 1, "EDITION_2024")).toBe(5);
    });

    it("L20 → +20", () => {
      expect(draconicResilienceMaxHpBonus(20, 1, "EDITION_2024")).toBe(20);
    });
  });

  it("the formulas diverge below L3, proving this isn't papered over as one expression", () => {
    expect(draconicResilienceMaxHpBonus(1, 1, "EDITION_2014")).toBe(1);
    expect(draconicResilienceMaxHpBonus(1, 1, "EDITION_2024")).toBe(0);
    expect(draconicResilienceMaxHpBonus(2, 1, "EDITION_2014")).toBe(2);
    expect(draconicResilienceMaxHpBonus(2, 1, "EDITION_2024")).toBe(0);
  });
});
