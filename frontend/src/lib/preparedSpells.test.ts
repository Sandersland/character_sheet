import { describe, it, expect } from "vitest";

import { deriveCastableSpells, derivePreparedCastable } from "@/lib/preparedSpells";
import type { Character, Spell } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

function spell(partial: Partial<Spell>): Spell {
  return {
    id: partial.name ?? "x",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    ...partial,
  } as Spell;
}

function sc(spells: Spell[]): Spellcasting {
  return { ability: "intelligence", spellSaveDC: 15, spellAttackBonus: 7, spells } as Spellcasting;
}

describe("derivePreparedCastable", () => {
  it("splits cantrips and prepared leveled spells", () => {
    const result = derivePreparedCastable(
      sc([
        spell({ name: "Fire Bolt", level: 0 }),
        spell({ name: "Fireball", level: 3, prepared: true }),
        spell({ name: "Shield", level: 1, prepared: true }),
      ]),
    );
    expect(result.cantrips.map((s) => s.name)).toEqual(["Fire Bolt"]);
    expect(result.prepared.map((s) => s.name)).toEqual(["Shield", "Fireball"]);
  });

  it("excludes leveled spells that are not prepared", () => {
    const result = derivePreparedCastable(
      sc([
        spell({ name: "Fireball", level: 3, prepared: false }),
        spell({ name: "Shield", level: 1, prepared: true }),
      ]),
    );
    expect(result.prepared.map((s) => s.name)).toEqual(["Shield"]);
  });

  it("returns empty groups for an empty spellcasting", () => {
    const result = derivePreparedCastable(sc([]));
    expect(result.cantrips).toEqual([]);
    expect(result.prepared).toEqual([]);
  });
});

// The Cast door's castable list (#1162): at-will cantrips + prepared leveled
// spells that currently have a slot to spend.
describe("deriveCastableSpells", () => {
  function character(spells: Spell[]): Character {
    return { spellcasting: sc(spells) } as unknown as Character;
  }

  it("always includes cantrips regardless of slots", () => {
    const result = deriveCastableSpells(character([spell({ name: "Fire Bolt", level: 0 })]), [], []);
    expect(result.map((s) => s.name)).toEqual(["Fire Bolt"]);
  });

  it("includes a prepared leveled spell when a matching slot is available", () => {
    const result = deriveCastableSpells(
      character([spell({ name: "Shield", level: 1, prepared: true })]),
      [1],
      [],
    );
    expect(result.map((s) => s.name)).toEqual(["Shield"]);
  });

  it("excludes a prepared leveled spell with no available slot", () => {
    const result = deriveCastableSpells(
      character([spell({ name: "Shield", level: 1, prepared: true })]),
      [],
      [],
    );
    expect(result).toEqual([]);
  });

  it("excludes an unprepared leveled spell even with a slot available", () => {
    const result = deriveCastableSpells(
      character([spell({ name: "Shield", level: 1, prepared: false })]),
      [1],
      [],
    );
    expect(result).toEqual([]);
  });
});
