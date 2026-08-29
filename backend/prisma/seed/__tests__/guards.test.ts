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

  it("passes a same-name 2014/2024 pair — the fork #1313 needs", () => {
    expect(() =>
      assertUniqueGrantedAbilityNames([
        { name: "Shadow Arts: Darkness", edition: "EDITION_2014" },
        { name: "Shadow Arts: Darkness", edition: "EDITION_2024" },
      ]),
    ).not.toThrow();
  });

  it("still throws on a same-name pair that both omit edition", () => {
    expect(() =>
      assertUniqueGrantedAbilityNames([{ name: "Riposte" }, { name: "Riposte" }]),
    ).toThrow(/duplicate GrantedAbility name "Riposte" \(edition: shared\)/);
  });

  it("names the offending edition when a fork repeats one", () => {
    expect(() =>
      assertUniqueGrantedAbilityNames([
        { name: "Shadow Arts: Darkness", edition: "EDITION_2014" },
        { name: "Shadow Arts: Darkness", edition: "EDITION_2024" },
        { name: "Shadow Arts: Darkness", edition: "EDITION_2014" },
      ]),
    ).toThrow(/duplicate GrantedAbility name "Shadow Arts: Darkness" \(edition: EDITION_2014\)/);
  });
});
