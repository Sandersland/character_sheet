import { describe, expect, it } from "vitest";

import {
  applyAbilitySpread,
  backgroundGrantsAbilitySpread,
  backgroundGrantsOriginFeat,
  floatingSpreadShapeValid,
  speciesGrantsAbilityIncreases,
} from "@/lib/rules/background-grants.js";
import type { RulesEdition } from "@character-sheet/shared-types";

describe("background-grants shared ability-spread machinery (#1681)", () => {
  describe("edition gates are opposite verdicts, not independently-set flags", () => {
    it.each([
      ["EDITION_2014" as RulesEdition, true, false],
      ["EDITION_2024" as RulesEdition, false, true],
    ])("%s: species=%s background=%s", (edition, speciesVerdict, backgroundVerdict) => {
      expect(speciesGrantsAbilityIncreases(edition)).toBe(speciesVerdict);
      expect(backgroundGrantsAbilitySpread(edition)).toBe(backgroundVerdict);
      expect(backgroundGrantsOriginFeat(edition)).toBe(backgroundVerdict);
    });
  });

  describe("floatingSpreadShapeValid — the shape both the 2024 background spread and a 2014 floating-spread species row validate through", () => {
    it("accepts a +2/+1 spread", () => {
      expect(floatingSpreadShapeValid([2, 1])).toBe(true);
    });
    it("accepts a +1/+1/+1 spread", () => {
      expect(floatingSpreadShapeValid([1, 1, 1])).toBe(true);
    });
    it("rejects a single +3", () => {
      expect(floatingSpreadShapeValid([3])).toBe(false);
    });
    it("rejects +2/+2 (sum 4)", () => {
      expect(floatingSpreadShapeValid([2, 2])).toBe(false);
    });
    it("rejects an in-range sum in the wrong shape (1/1/2)", () => {
      expect(floatingSpreadShapeValid([1, 1, 2])).toBe(false);
    });
  });

  describe("applyAbilitySpread", () => {
    it("folds a spread onto base scores", () => {
      expect(applyAbilitySpread({ strength: 12, constitution: 14 }, { strength: 1, wisdom: 2 })).toEqual({
        strength: 13,
        constitution: 14,
        wisdom: 12,
      });
    });
    it("defaults an unlisted ability to 10 before adding the bump", () => {
      expect(applyAbilitySpread({}, { charisma: 2 })).toEqual({ charisma: 12 });
    });
    it("returns the base unchanged when spread is undefined", () => {
      expect(applyAbilitySpread({ strength: 12 }, undefined)).toEqual({ strength: 12 });
    });
  });
});
