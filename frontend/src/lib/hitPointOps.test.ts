import { describe, it, expect } from "vitest";

import { buildHpOps } from "@/lib/hitPointOps";

describe("buildHpOps", () => {
  describe("damage mode", () => {
    it("builds a damage op carrying type, resistance, and auto-roll meta", () => {
      const ops = buildHpOps("damage", 8, {
        damageType: "fire",
        applyResistance: true,
        autoRollConcentration: false,
      });
      expect(ops).toEqual([
        {
          type: "damage",
          amount: 8,
          damageType: "fire",
          applyResistance: true,
          autoRollConcentration: false,
        },
      ]);
    });

    it("defaults the meta fields to undefined when omitted", () => {
      expect(buildHpOps("damage", 3)).toEqual([
        {
          type: "damage",
          amount: 3,
          damageType: undefined,
          applyResistance: undefined,
          autoRollConcentration: undefined,
        },
      ]);
    });

    it("returns null for a zero or negative amount", () => {
      expect(buildHpOps("damage", 0)).toBeNull();
      expect(buildHpOps("damage", -4)).toBeNull();
    });

    it("returns null for NaN (empty field)", () => {
      expect(buildHpOps("damage", NaN)).toBeNull();
    });
  });

  describe("heal mode", () => {
    it("builds a bare heal op and ignores damage meta", () => {
      expect(buildHpOps("heal", 5, { damageType: "fire", autoRollConcentration: false })).toEqual([
        { type: "heal", amount: 5 },
      ]);
    });

    it("returns null for a zero or negative amount", () => {
      expect(buildHpOps("heal", 0)).toBeNull();
      expect(buildHpOps("heal", -1)).toBeNull();
    });

    it("returns null for NaN", () => {
      expect(buildHpOps("heal", NaN)).toBeNull();
    });
  });

  describe("temp mode", () => {
    it("allows 0 to clear temp HP", () => {
      expect(buildHpOps("temp", 0)).toEqual([{ type: "setTemp", amount: 0 }]);
    });

    it("builds a setTemp op for a positive amount", () => {
      expect(buildHpOps("temp", 7)).toEqual([{ type: "setTemp", amount: 7 }]);
    });

    it("returns null for a negative amount or NaN", () => {
      expect(buildHpOps("temp", -2)).toBeNull();
      expect(buildHpOps("temp", NaN)).toBeNull();
    });
  });
});
