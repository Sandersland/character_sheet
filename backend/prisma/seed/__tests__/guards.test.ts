// Unit tests for the pure fail-fast guard extracted from seed.ts main().
import { describe, it, expect } from "vitest";

import { assertUniqueGrantedAbilityNames } from "../guards.js";

describe("assertUniqueGrantedAbilityNames", () => {
  it("passes when all names are unique", () => {
    expect(() =>
      assertUniqueGrantedAbilityNames([{ name: "Riposte" }, { name: "Quivering Palm" }]),
    ).not.toThrow();
  });

  it("passes on an empty list", () => {
    expect(() => assertUniqueGrantedAbilityNames([])).not.toThrow();
  });

  it("throws naming the first duplicate across sources", () => {
    expect(() =>
      assertUniqueGrantedAbilityNames([
        { name: "Riposte" },
        { name: "Feint" },
        { name: "Riposte" },
      ]),
    ).toThrow(/duplicate GrantedAbility name "Riposte"/);
  });
});
