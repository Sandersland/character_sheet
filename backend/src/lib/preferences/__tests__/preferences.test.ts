import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  mergePreferencesPatch,
  preferencesPatchSchema,
  preferencesSchema,
  resolvePreferences,
} from "@/lib/preferences/preferences.js";

describe("preferencesSchema", () => {
  it("round-trips a fully-specified object", () => {
    const input = { theme: "dark", diceRollStyle: "quick", autoRollConcentration: false };
    const result = preferencesSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("fills in defaults for missing keys", () => {
    const result = preferencesSchema.parse({ theme: "dark" });
    expect(result).toEqual({ theme: "dark", diceRollStyle: "animated", autoRollConcentration: true });
  });

  it("rejects an invalid enum value", () => {
    expect(preferencesSchema.safeParse({ theme: "purple" }).success).toBe(false);
  });

  it("strips unknown keys rather than rejecting them", () => {
    const result = preferencesSchema.parse({ theme: "dark", bogus: "nope" });
    expect(result).toEqual({ theme: "dark", diceRollStyle: "animated", autoRollConcentration: true });
    expect(result).not.toHaveProperty("bogus");
  });
});

describe("preferencesPatchSchema", () => {
  it("accepts a single-key partial patch", () => {
    expect(preferencesPatchSchema.safeParse({ theme: "light" }).success).toBe(true);
  });

  it("accepts an empty patch", () => {
    expect(preferencesPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown key (strict, unlike the read-side schema)", () => {
    expect(preferencesPatchSchema.safeParse({ bogus: true }).success).toBe(false);
  });
});

describe("resolvePreferences (read path — never throws)", () => {
  it("returns null for a never-stored (absent) column", () => {
    expect(resolvePreferences(null)).toBeNull();
  });

  it("returns defaults for a corrupt (non-object) stored value", () => {
    expect(resolvePreferences("garbage")).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns defaults for a stored value that fails validation", () => {
    expect(resolvePreferences({ theme: "purple" })).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns the defaulted object for a partially-stored value", () => {
    expect(resolvePreferences({ theme: "dark" })).toEqual({
      theme: "dark",
      diceRollStyle: "animated",
      autoRollConcentration: true,
    });
  });
});

describe("mergePreferencesPatch (write path)", () => {
  it("merges a patch onto an existing stored object, keeping untouched keys", () => {
    const merged = mergePreferencesPatch({ theme: "dark", diceRollStyle: "quick" }, { theme: "light" });
    expect(merged).toEqual({ theme: "light", diceRollStyle: "quick" });
  });

  it("treats a null (never-stored) base as empty, so the patch becomes the whole object", () => {
    const merged = mergePreferencesPatch(null, { theme: "light" });
    expect(merged).toEqual({ theme: "light" });
  });

  it("treats a corrupt (non-object) base as empty rather than propagating it", () => {
    const merged = mergePreferencesPatch("garbage", { theme: "light" });
    expect(merged).toEqual({ theme: "light" });
  });
});
