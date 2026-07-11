import { describe, expect, it } from "vitest";

import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";

describe("normalizeSpellcastingMutable", () => {
  it("returns an empty mutable state for null / non-object blobs", () => {
    const empty = { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null };
    expect(normalizeSpellcastingMutable(null)).toEqual(empty);
    expect(normalizeSpellcastingMutable("nope" as unknown as null)).toEqual(empty);
    expect(normalizeSpellcastingMutable([] as unknown as null)).toEqual(empty);
  });

  it("passes through the new compact format", () => {
    const state = normalizeSpellcastingMutable({
      slotsUsed: { "1": 2 },
      arcanumUsed: { "6": 1 },
      spells: [{ id: "s1", prepared: true }],
      concentratingOn: { entryId: "s1", spellName: "Bless" },
    });
    expect(state).toEqual({
      slotsUsed: { "1": 2 },
      arcanumUsed: { "6": 1 },
      spells: [{ id: "s1", prepared: true }],
      concentratingOn: { entryId: "s1", spellName: "Bless" },
    });
  });

  it("migrates the legacy blob: keeps used>0 slots, drops derived fields", () => {
    const state = normalizeSpellcastingMutable({
      ability: "intelligence",
      spellSaveDC: 15,
      spellAttackBonus: 7,
      slots: [
        { level: 1, total: 4, used: 2 },
        { level: 2, total: 3, used: 0 }, // used === 0 is dropped
        { level: 3, total: 2, used: 1 },
      ],
      spells: [{ id: "legacy-1", prepared: false }],
    });
    expect(state.slotsUsed).toEqual({ "1": 2, "3": 1 });
    expect(state.arcanumUsed).toEqual({});
    expect(state.spells).toEqual([{ id: "legacy-1", prepared: false }]);
    expect(state.concentratingOn).toBeNull();
  });

  it("defaults a legacy blob with no slots array to an empty slotsUsed map", () => {
    const state = normalizeSpellcastingMutable({ ability: "wisdom", spells: [] });
    expect(state.slotsUsed).toEqual({});
    expect(state.spells).toEqual([]);
  });

  it("coerces an invalid concentration value to null", () => {
    expect(normalizeSpellcastingMutable({ slotsUsed: {}, concentratingOn: "bad" }).concentratingOn).toBeNull();
    expect(normalizeSpellcastingMutable({ slotsUsed: {}, concentratingOn: { entryId: "" } }).concentratingOn).toBeNull();
  });
});
