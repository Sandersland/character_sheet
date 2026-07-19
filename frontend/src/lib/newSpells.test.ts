import { describe, it, expect } from "vitest";

import {
  eligibleNewSpells,
  readNewSpellsMeta,
  selectedSpellIds,
  toggleLearnSpell,
} from "@/lib/newSpells";
import type { CatalogSpell, LearnSpellOperation, LevelUpStep } from "@/types/character";

function spell(id: string, level: number, classes: string[]): CatalogSpell {
  return {
    id, name: id, level, school: "evocation", castingTime: "1 action",
    range: "60 ft", duration: "Instant", description: "", concentration: false,
    ritual: false, classes, cantripScaling: false,
  };
}

const CATALOG: CatalogSpell[] = [
  spell("firebolt", 0, ["wizard", "sorcerer"]),   // cantrip — excluded
  spell("shield", 1, ["wizard", "sorcerer"]),
  spell("mistyStep", 2, ["wizard", "sorcerer"]),
  spell("fireball", 3, ["wizard", "sorcerer"]),   // above a level-2 ceiling
  spell("cureWounds", 1, ["bard", "cleric"]),     // off-class for a wizard
];

describe("readNewSpellsMeta", () => {
  it("reads count, ceiling, and the secrets flag", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 2, meta: { maxSpellLevel: 5, magicalSecrets: true } };
    expect(readNewSpellsMeta(step)).toEqual({ count: 2, maxSpellLevel: 5, magicalSecrets: true });
  });

  it("defaults ceiling to 0 and secrets to false when meta is absent", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1 };
    expect(readNewSpellsMeta(step)).toEqual({ count: 1, maxSpellLevel: 0, magicalSecrets: false });
  });
});

describe("eligibleNewSpells", () => {
  it("keeps on-class spells of level 1..ceiling, dropping cantrips and above-ceiling", () => {
    const eligible = eligibleNewSpells(CATALOG, { className: "wizard", maxSpellLevel: 2, magicalSecrets: false });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep"]);
  });

  it("matches the class name case-insensitively", () => {
    const eligible = eligibleNewSpells(CATALOG, { className: "Wizard", maxSpellLevel: 1, magicalSecrets: false });
    expect(eligible.map((s) => s.id)).toEqual(["shield"]);
  });

  it("with Magical Secrets ignores the class list (any list, still level-gated)", () => {
    const eligible = eligibleNewSpells(CATALOG, { className: "bard", maxSpellLevel: 2, magicalSecrets: true });
    expect(eligible.map((s) => s.id)).toEqual(["shield", "mistyStep", "cureWounds"]);
  });

  it("handles a null catalog", () => {
    expect(eligibleNewSpells(null, { className: "wizard", maxSpellLevel: 2, magicalSecrets: false })).toEqual([]);
  });
});

describe("toggleLearnSpell", () => {
  it("adds a learnSpell op when under the cap", () => {
    expect(toggleLearnSpell([], "shield", 2)).toEqual([{ type: "learnSpell", spellId: "shield" }]);
  });

  it("removes an already-selected spell", () => {
    const current: LearnSpellOperation[] = [{ type: "learnSpell", spellId: "shield" }];
    expect(toggleLearnSpell(current, "shield", 2)).toEqual([]);
  });

  it("refuses to add past the cap", () => {
    const current: LearnSpellOperation[] = [
      { type: "learnSpell", spellId: "shield" },
      { type: "learnSpell", spellId: "mistyStep" },
    ];
    expect(toggleLearnSpell(current, "fireball", 2)).toBe(current);
  });
});

describe("selectedSpellIds", () => {
  it("extracts catalog spellIds, tolerating undefined", () => {
    expect(selectedSpellIds(undefined)).toEqual([]);
    expect(
      selectedSpellIds([{ type: "learnSpell", spellId: "shield" }, { type: "learnSpell", custom: undefined, spellId: "mistyStep" }]),
    ).toEqual(["shield", "mistyStep"]);
  });
});
