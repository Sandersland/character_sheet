import { describe, expect, it } from "vitest";

import { entryDetail, NUMERIC_TARGET_LABELS } from "./advancement";
import type { AdvancementEntry } from "@/types/character";

function feat(overrides: Partial<AdvancementEntry>): AdvancementEntry {
  return {
    id: "f",
    level: 4,
    kind: "feat",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    ...overrides,
  };
}

function asi(overrides: Partial<AdvancementEntry>): AdvancementEntry {
  return {
    id: "a",
    level: 4,
    kind: "asi",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    ...overrides,
  };
}

describe("entryDetail — feat", () => {
  it("summarizes ability bumps only", () => {
    expect(entryDetail(feat({ abilityDeltas: { strength: 2 } }))).toBe("+2 Strength");
  });

  it("summarizes numeric improvements with and without perLevel", () => {
    expect(
      entryDetail(
        feat({
          improvements: [
            { target: "maxHp", amount: 5, perLevel: true },
            { target: "initiative", amount: 1 },
          ],
        })
      )
    ).toBe("+5/level max HP · +1 initiative");
  });

  it("lists multiple skill proficiencies", () => {
    expect(
      entryDetail(
        feat({
          improvements: [
            { target: "skillProficiency", key: "athletics", amount: 0 },
            { target: "skillProficiency", key: "sleightOfHand", amount: 0 },
          ],
        })
      )
    ).toBe("Prof: Athletics, Sleight of Hand");
  });

  it("lists saving throw proficiencies", () => {
    expect(
      entryDetail(
        feat({
          improvements: [{ target: "savingThrowProficiency", key: "constitution", amount: 0 }],
        })
      )
    ).toBe("Save prof: Constitution");
  });

  it("joins the full combined detail with ' · '", () => {
    expect(
      entryDetail(
        feat({
          abilityDeltas: { strength: 2 },
          improvements: [
            { target: "maxHp", amount: 5, perLevel: true },
            { target: "initiative", amount: 1 },
            { target: "skillProficiency", key: "athletics", amount: 0 },
            { target: "savingThrowProficiency", key: "constitution", amount: 0 },
          ],
        })
      )
    ).toBe("+2 Strength · +5/level max HP · +1 initiative · Prof: Athletics · Save prof: Constitution");
  });

  it("falls back to featDescription when nothing to summarize", () => {
    expect(entryDetail(feat({ featDescription: "Grants darkvision." }))).toBe(
      "Grants darkvision."
    );
  });

  it("returns undefined when everything is zero and there is no description", () => {
    expect(entryDetail(feat({ abilityDeltas: { strength: 0 } }))).toBeUndefined();
  });
});

describe("entryDetail — asi", () => {
  it("summarizes hp only", () => {
    expect(entryDetail(asi({ hpDelta: 5 }))).toBe("+5 max HP");
  });

  it("summarizes init only", () => {
    expect(entryDetail(asi({ initDelta: 3 }))).toBe("+3 initiative");
  });

  it("summarizes both joined with ', '", () => {
    expect(entryDetail(asi({ hpDelta: 5, initDelta: 3 }))).toBe("+5 max HP, +3 initiative");
  });

  it("returns undefined when both are zero", () => {
    expect(entryDetail(asi({ hpDelta: 0, initDelta: 0 }))).toBeUndefined();
  });
});

describe("NUMERIC_TARGET_LABELS", () => {
  it("maps the four numeric targets", () => {
    expect(NUMERIC_TARGET_LABELS).toEqual({
      speed: "speed",
      maxHp: "max HP",
      armorClass: "AC",
      initiative: "initiative",
    });
  });
});
