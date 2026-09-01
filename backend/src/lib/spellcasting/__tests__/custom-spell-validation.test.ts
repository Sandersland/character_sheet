// validateCustomSpellCoherence is the one cross-field validation surface both POST and PATCH
// /api/spells/custom call (#1785) — see custom-spells.test.ts for the HTTP-level 400 assertions.
import { describe, expect, it } from "vitest";

import { validateCustomSpellCoherence } from "../custom-spell-validation.js";

const base = { level: 1 };

describe("validateCustomSpellCoherence — multi-instance fields (#1981/#1984)", () => {
  it("accepts instanceCount + instanceRoll + upcastInstancesPerLevel together", () => {
    expect(
      validateCustomSpellCoherence({ ...base, instanceCount: 3, instanceRoll: "once", upcastInstancesPerLevel: 1 }),
    ).toBeNull();
  });

  it("accepts instanceCount alone", () => {
    expect(validateCustomSpellCoherence({ ...base, instanceCount: 3 })).toBeNull();
  });

  it("rejects instanceRoll without instanceCount", () => {
    expect(validateCustomSpellCoherence({ ...base, instanceRoll: "each" })).toMatch(/instanceRoll requires instanceCount/);
  });

  it("rejects upcastInstancesPerLevel without instanceCount", () => {
    expect(validateCustomSpellCoherence({ ...base, upcastInstancesPerLevel: 1 })).toMatch(
      /upcastInstancesPerLevel requires instanceCount/,
    );
  });

  it("rejects upcastInstancesPerLevel on a cantrip (level 0), even with instanceCount set", () => {
    expect(
      validateCustomSpellCoherence({ level: 0, instanceCount: 2, upcastInstancesPerLevel: 1 }),
    ).toMatch(/never legal on a cantrip/);
  });

  it("accepts upcastInstancesPerLevel on a leveled spell with instanceCount", () => {
    expect(validateCustomSpellCoherence({ level: 1, instanceCount: 3, upcastInstancesPerLevel: 1 })).toBeNull();
  });

  it("un-instanced input (no instance fields at all) is unaffected", () => {
    expect(validateCustomSpellCoherence({ ...base, effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 6 })).toBeNull();
  });
});
