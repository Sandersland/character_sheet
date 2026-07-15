import { describe, it, expect } from "vitest";

import { derivePreparedSummary } from "@/lib/preparedSummary";
import type { Character } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

function sc(partial: Partial<Spellcasting>): Spellcasting {
  return { ability: "intelligence", spellSaveDC: 15, spellAttackBonus: 7, ...partial } as Spellcasting;
}

describe("derivePreparedSummary", () => {
  it("returns the derived count and limit for a prepared caster", () => {
    expect(derivePreparedSummary(sc({ preparedSpellLimit: 12, preparedSpellCount: 11 }))).toEqual({
      count: 11,
      limit: 12,
    });
  });

  it("falls back to counting prepared spells when count is absent", () => {
    const summary = derivePreparedSummary(
      sc({
        preparedSpellLimit: 6,
        spells: [
          { id: "a", prepared: true, level: 1 },
          { id: "b", prepared: false, level: 2 },
          { id: "c", prepared: true, level: 3 },
        ] as Spellcasting["spells"],
      }),
    );
    expect(summary).toEqual({ count: 2, limit: 6 });
  });

  it("returns null for a known caster with no prepare mechanic (limit null)", () => {
    expect(derivePreparedSummary(sc({ preparedSpellLimit: null, preparedSpellCount: 0 }))).toBeNull();
  });

  it("returns null when the cap has not been derived yet", () => {
    expect(derivePreparedSummary(sc({}))).toBeNull();
  });
});
