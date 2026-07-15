import { describe, it, expect } from "vitest";

import { derivePreparedCastable } from "@/lib/preparedSpells";
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
