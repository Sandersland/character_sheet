import { describe, expect, it } from "vitest";

import { abilityCapOverflowError, postBonusAbilityCap } from "../shared.js";
import type { AbilityGenerationMethod } from "@character-sheet/shared-types";

describe("postBonusAbilityCap — method-aware post-bonus ability cap (#1978)", () => {
  it.each([
    ["standardArray" as AbilityGenerationMethod, 20],
    ["pointBuy" as AbilityGenerationMethod, 20],
    ["roll" as AbilityGenerationMethod, 30],
    ["manual" as AbilityGenerationMethod, 30],
    [undefined, 30],
  ])("%s -> %i", (method, cap) => {
    expect(postBonusAbilityCap(method)).toBe(cap);
  });
});

describe("abilityCapOverflowError uses the method-aware cap, not a hardcoded 20", () => {
  it("standardArray: a spread landing exactly on 20 is fine", () => {
    expect(abilityCapOverflowError([["dexterity", 2]], { dexterity: 18 }, "backgroundAbilities", "standardArray")).toBeNull();
  });

  it("standardArray: a spread landing over 20 is rejected, citing 20", () => {
    const result = abilityCapOverflowError([["dexterity", 2]], { dexterity: 19 }, "backgroundAbilities", "standardArray");
    expect(result).toEqual({ ok: false, status: 400, error: "backgroundAbilities: dexterity would exceed 20" });
  });

  it("manual: the SAME base+spread that standardArray rejects is fine (30 sanity ceiling, not 20)", () => {
    expect(abilityCapOverflowError([["dexterity", 2]], { dexterity: 19 }, "backgroundAbilities", "manual")).toBeNull();
  });

  it("manual: a spread landing over 30 is rejected, citing 30 (not 20)", () => {
    const result = abilityCapOverflowError([["dexterity", 2]], { dexterity: 29 }, "backgroundAbilities", "manual");
    expect(result).toEqual({ ok: false, status: 400, error: "backgroundAbilities: dexterity would exceed 30" });
  });

  it("an omitted method (PATCH's own case) behaves exactly like manual", () => {
    expect(abilityCapOverflowError([["dexterity", 2]], { dexterity: 19 }, "backgroundAbilities", undefined)).toBeNull();
    const result = abilityCapOverflowError([["dexterity", 2]], { dexterity: 29 }, "backgroundAbilities", undefined);
    expect(result?.error).toBe("backgroundAbilities: dexterity would exceed 30");
  });

  it("roll shares manual's 30 ceiling, not standardArray/pointBuy's 20", () => {
    expect(abilityCapOverflowError([["dexterity", 2]], { dexterity: 19 }, "backgroundAbilities", "roll")).toBeNull();
  });
});
