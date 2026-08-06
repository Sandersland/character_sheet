// #1756: chooseCantrip's two shapes — High Elf's class-LIST + fixed casting
// ability, and Astral Fire's explicit named SPELLS list + player-chosen
// ability. The schema enforces exactly one of `list`/`spells` and treats a
// missing castingAbility as "player chooses" (chooseCantripNeedsPlayerAbility).
import { describe, expect, it } from "vitest";

import {
  chooseCantripNeedsPlayerAbility,
  speciesTraitChoiceSchema,
  type ChooseCantrip,
} from "../species-trait-choices.js";

function parseCantrip(chooseCantrip: unknown) {
  return speciesTraitChoiceSchema.safeParse({ chooseCantrip });
}

describe("chooseCantripSchema — list vs spells (#1756)", () => {
  it("accepts an explicit named spells list with no fixed castingAbility (Astral Fire)", () => {
    const res = parseCantrip({ spells: ["Dancing Lights", "Light", "Sacred Flame"] });
    expect(res.success).toBe(true);
  });

  it("accepts a class list with a fixed castingAbility (High Elf)", () => {
    const res = parseCantrip({ list: "wizard", castingAbility: "intelligence" });
    expect(res.success).toBe(true);
  });

  it("accepts a spells list with a fixed castingAbility too (both fields are independently optional)", () => {
    const res = parseCantrip({ spells: ["Light"], castingAbility: "wisdom" });
    expect(res.success).toBe(true);
  });

  it("rejects carrying both `list` and `spells`", () => {
    const res = parseCantrip({ list: "wizard", spells: ["Light"] });
    expect(res.success).toBe(false);
  });

  it("rejects carrying neither `list` nor `spells`", () => {
    const res = parseCantrip({ castingAbility: "charisma" });
    expect(res.success).toBe(false);
  });

  it("rejects an empty spells array", () => {
    const res = parseCantrip({ spells: [] });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown ability name", () => {
    const res = parseCantrip({ spells: ["Light"], castingAbility: "luck" });
    expect(res.success).toBe(false);
  });
});

describe("chooseCantripNeedsPlayerAbility (#1756)", () => {
  it("is true for a spec with no fixed casting ability (Astral Fire)", () => {
    const spec: ChooseCantrip = { spells: ["Light"] };
    expect(chooseCantripNeedsPlayerAbility(spec)).toBe(true);
  });

  it("is false for a spec with a fixed casting ability (High Elf)", () => {
    const spec: ChooseCantrip = { list: "wizard", castingAbility: "intelligence" };
    expect(chooseCantripNeedsPlayerAbility(spec)).toBe(false);
  });

  it("is false for a null spec (species with no cantrip choice)", () => {
    expect(chooseCantripNeedsPlayerAbility(null)).toBe(false);
  });
});
