import { describe, it, expect } from "vitest";

import { deriveSpellList, availableSlotsForSpell } from "@/lib/spellList";
import type { Character, Spell } from "@/types/character";

function spell(over: Partial<Spell> & { id: string; name: string; level: number }): Spell {
  return {
    school: "evocation",
    prepared: false,
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    ...over,
  } as Spell;
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: "c1",
    level: 5,
    classes: [{ name: "Wizard" }],
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 16, wisdom: 10, charisma: 10,
    },
    activeEffects: { buffs: [] },
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 13,
      spellAttackBonus: 5,
      slots: [],
      arcana: [],
      spells: [],
      concentratingOn: null,
    },
    ...over,
  } as unknown as Character;
}

describe("deriveSpellList", () => {
  it("returns available slot levels only where slots remain, sorted ascending", () => {
    const character = makeCharacter({
      spellcasting: {
        ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5,
        slots: [
          { level: 3, total: 2, used: 2 }, // fully used → excluded
          { level: 2, total: 2, used: 1 },
          { level: 1, total: 2, used: 0 },
        ],
        arcana: [], spells: [], concentratingOn: null,
      },
    } as unknown as Partial<Character>);
    const d = deriveSpellList(character);
    expect(d.availableSlotLevels).toEqual([1, 2]);
  });

  it("returns available arcana levels only where a charge remains", () => {
    const character = makeCharacter({
      spellcasting: {
        ability: "charisma", spellSaveDC: 13, spellAttackBonus: 5, slots: [],
        arcana: [
          { level: 6, total: 1, used: 0 },
          { level: 7, total: 1, used: 1 }, // spent → excluded
        ],
        spells: [], concentratingOn: null,
      },
    } as unknown as Partial<Character>);
    expect(deriveSpellList(character).availableArcanaLevels).toEqual([6]);
  });

  it("collects learned catalog spell ids and skips entries without a spellId", () => {
    const character = makeCharacter({
      spellcasting: {
        ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5, slots: [], arcana: [],
        spells: [
          spell({ id: "e1", name: "Fireball", level: 3, spellId: "cat-fireball" }),
          spell({ id: "e2", name: "Homebrew", level: 1 }), // no spellId
        ],
        concentratingOn: null,
      },
    } as unknown as Partial<Character>);
    const ids = deriveSpellList(character).learnedSpellIds;
    expect(ids.has("cat-fireball")).toBe(true);
    expect(ids.size).toBe(1);
  });

  it("sorts spells by level then name and lists unique levels ascending", () => {
    const character = makeCharacter({
      spellcasting: {
        ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5, slots: [], arcana: [],
        spells: [
          spell({ id: "e1", name: "Zephyr", level: 1 }),
          spell({ id: "e2", name: "Acid Splash", level: 0 }),
          spell({ id: "e3", name: "Alarm", level: 1 }),
        ],
        concentratingOn: null,
      },
    } as unknown as Partial<Character>);
    const d = deriveSpellList(character);
    expect(d.sortedSpells.map((s) => s.name)).toEqual(["Acid Splash", "Alarm", "Zephyr"]);
    expect(d.spellLevels).toEqual([0, 1]);
  });

  it("selects only while-active buffs sourced from a spell in the book", () => {
    const character = makeCharacter({
      activeEffects: {
        buffs: [
          { id: "b1", key: "mageArmor", target: "armorClass", modifier: 3, source: "Mage Armor", sourceEntryId: "e1", duration: "while-active" },
          { id: "b2", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", sourceEntryId: "rage-x", duration: "while-active" },
          { id: "b3", key: "bless", target: "attack", modifier: 1, source: "Bless", sourceEntryId: "e1", duration: "concentration" },
        ],
      },
      spellcasting: {
        ability: "intelligence", spellSaveDC: 13, spellAttackBonus: 5, slots: [], arcana: [],
        spells: [spell({ id: "e1", name: "Mage Armor", level: 1 })],
        concentratingOn: null,
      },
    } as unknown as Partial<Character>);
    const buffs = deriveSpellList(character).dismissibleSpellBuffs;
    expect(buffs.map((b) => b.id)).toEqual(["b1"]);
  });

  it("labels a single-class warlock's merged slots as Pact Magic", () => {
    const character = makeCharacter({ classes: [{ name: "Warlock" }] } as unknown as Partial<Character>);
    expect(deriveSpellList(character).slotsArePactMagic).toBe(true);
  });

  it("does not treat a multiclass warlock's merged pool as Pact Magic", () => {
    const character = makeCharacter({
      classes: [{ name: "Warlock" }, { name: "Sorcerer" }],
    } as unknown as Partial<Character>);
    expect(deriveSpellList(character).slotsArePactMagic).toBe(false);
  });

  it("is not Pact Magic for a non-warlock", () => {
    expect(deriveSpellList(makeCharacter()).slotsArePactMagic).toBe(false);
  });
});

describe("availableSlotsForSpell", () => {
  it("returns no slots for a cantrip", () => {
    const cantrip = spell({ id: "e1", name: "Fire Bolt", level: 0 });
    expect(availableSlotsForSpell(cantrip, [1, 2], [])).toEqual([]);
  });

  it("returns only slot levels at or above the spell level", () => {
    const s = spell({ id: "e1", name: "Fireball", level: 3 });
    expect(availableSlotsForSpell(s, [1, 2, 3, 4], [])).toEqual([3, 4]);
  });

  it("adds a matching Mystic Arcanum level when no like-level slot exists", () => {
    const s = spell({ id: "e1", name: "Eyebite", level: 6 });
    expect(availableSlotsForSpell(s, [], [6])).toEqual([6]);
  });

  it("does not duplicate a level already covered by a slot", () => {
    const s = spell({ id: "e1", name: "Eyebite", level: 6 });
    expect(availableSlotsForSpell(s, [6, 7], [6])).toEqual([6, 7]);
  });
});
