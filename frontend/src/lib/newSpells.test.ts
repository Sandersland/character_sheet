import { describe, it, expect } from "vitest";

import {
  eligibleNewSpells,
  readNewSpellsMeta,
  selectedSpellIds,
  swappableKnownSpells,
  toggleForgetSpell,
  toggleLearnSpell,
} from "@/lib/newSpells";
import type { CatalogSpell, LearnSpellOperation, LevelUpStep, Spell } from "@/types/character";

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
  spell("chaosBolt", 1, ["sorcerer"]),            // sorcerer-only — off every Magical Secrets list
];

describe("readNewSpellsMeta", () => {
  it("reads count, ceiling, and the secrets flag", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 2, meta: { maxSpellLevel: 5, magicalSecrets: true } };
    expect(readNewSpellsMeta(step)).toEqual({ count: 2, maxSpellLevel: 5, magicalSecrets: true, canSwap: false });
  });

  it("defaults ceiling to 0 and secrets to false when meta is absent", () => {
    const step: LevelUpStep = { kind: "newSpells", count: 1 };
    expect(readNewSpellsMeta(step)).toEqual({ count: 1, maxSpellLevel: 0, magicalSecrets: false, canSwap: false });
  });

  it("reads canSwap from meta (#1101)", () => {
    expect(readNewSpellsMeta({ kind: "newSpells", count: 0, meta: { canSwap: true } }).canSwap).toBe(true);
    expect(readNewSpellsMeta({ kind: "newSpells", count: 1 }).canSwap).toBe(false);
  });
});

describe("swappableKnownSpells (#1101)", () => {
  function known(id: string, level: number, source?: "subclass" | "item"): Spell {
    return {
      id, name: id, level, school: "evocation", castingTime: "1 action",
      range: "60 ft", duration: "Instant", description: "", prepared: false, source,
    };
  }

  it("keeps user-learned leveled spells, dropping cantrips and granted/item spells", () => {
    const spells: Spell[] = [
      known("firebolt", 0),                 // cantrip — excluded
      known("shield", 1),                   // kept
      known("mistyStep", 2),                // kept
      known("hex", 1, "subclass"),          // granted — excluded
      known("faerieFire", 1, "item"),       // item — excluded
    ];
    expect(swappableKnownSpells(spells).map((s) => s.id)).toEqual(["shield", "mistyStep"]);
  });

  it("tolerates an empty list", () => {
    expect(swappableKnownSpells([])).toEqual([]);
  });
});

describe("toggleForgetSpell (#1101)", () => {
  const learn = (id: string): LearnSpellOperation => ({ type: "learnSpell", spellId: id });

  it("selects a forget when none is set (learns untouched)", () => {
    const out = toggleForgetSpell({ spellsLearned: [learn("s1")] }, "e1", 1);
    expect(out.spellsForgotten).toEqual([{ type: "forgetSpell", entryId: "e1" }]);
    expect(out.spellsLearned).toEqual([learn("s1")]);
  });

  it("replaces a prior forget with a different one", () => {
    const out = toggleForgetSpell({ spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }] }, "e2", 1);
    expect(out.spellsForgotten).toEqual([{ type: "forgetSpell", entryId: "e2" }]);
  });

  it("deselects when toggling the same entry, trimming the over-cap extra learn", () => {
    const out = toggleForgetSpell(
      { spellsForgotten: [{ type: "forgetSpell", entryId: "e1" }], spellsLearned: [learn("s1"), learn("s2")] },
      "e1",
      1,
    );
    expect(out.spellsForgotten).toEqual([]);
    expect(out.spellsLearned).toEqual([learn("s1")]); // trimmed back to count
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

  it("with Magical Secrets admits only the Bard/Cleric/Druid/Wizard lists (2024), still level-gated", () => {
    const eligible = eligibleNewSpells(CATALOG, { className: "bard", maxSpellLevel: 2, magicalSecrets: true });
    // shield/mistyStep (wizard) + cureWounds (bard/cleric) admitted; chaosBolt (sorcerer-only) excluded.
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
