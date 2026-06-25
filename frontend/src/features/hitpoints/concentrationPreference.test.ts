import { describe, it, expect, beforeEach } from "vitest";

import {
  loadAutoRollConcentration,
  saveAutoRollConcentration,
} from "@/features/hitpoints/concentrationPreference";

describe("auto-roll concentration preference (issue #76)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to true when nothing is stored", () => {
    expect(loadAutoRollConcentration()).toBe(true);
  });

  it("round-trips false and true", () => {
    saveAutoRollConcentration(false);
    expect(loadAutoRollConcentration()).toBe(false);
    saveAutoRollConcentration(true);
    expect(loadAutoRollConcentration()).toBe(true);
  });

  it("treats a corrupted value as the default (true)", () => {
    localStorage.setItem("cs:pref:autoRollConcentration", "garbage");
    expect(loadAutoRollConcentration()).toBe(true);
  });
});
