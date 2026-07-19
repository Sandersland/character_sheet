import { describe, expect, it } from "vitest";

import { clampPreparedToLimit, normalizeSpellcastingMutable, type SpellEntry } from "@/lib/spellcasting/spell-state.js";

function spell(over: Partial<SpellEntry> & { id: string }): SpellEntry {
  return {
    name: over.id, level: 1, school: "evocation", prepared: true, castingTime: "1 action",
    range: "60 ft", duration: "Instantaneous", description: "", ...over,
  } as SpellEntry;
}

describe("clampPreparedToLimit (#1127)", () => {
  it("keeps the first N user-learned leveled prepared spells and unprepares the rest", () => {
    const spells = [spell({ id: "a" }), spell({ id: "b" }), spell({ id: "c" })];
    const { spells: out, trimmedCount } = clampPreparedToLimit(spells, 2);
    expect(trimmedCount).toBe(1);
    expect(out.map((s) => s.prepared)).toEqual([true, true, false]);
  });

  it("never counts cantrips or granted/item spells against the cap", () => {
    const spells = [
      spell({ id: "cantrip", level: 0 }),
      spell({ id: "granted", source: "subclass" }),
      spell({ id: "item", source: "item" }),
      spell({ id: "learned1" }),
      spell({ id: "learned2" }),
    ];
    const { spells: out, trimmedCount } = clampPreparedToLimit(spells, 1);
    expect(trimmedCount).toBe(1); // only learned2 trimmed
    expect(out.find((s) => s.id === "learned2")?.prepared).toBe(false);
    expect(out.find((s) => s.id === "cantrip")?.prepared).toBe(true);
    expect(out.find((s) => s.id === "granted")?.prepared).toBe(true);
  });

  it("is a no-op (same array ref) when within the cap or the limit is null", () => {
    const spells = [spell({ id: "a" }), spell({ id: "b" })];
    expect(clampPreparedToLimit(spells, 5)).toEqual({ spells, trimmedCount: 0 });
    expect(clampPreparedToLimit(spells, 5).spells).toBe(spells);
    expect(clampPreparedToLimit(spells, null).spells).toBe(spells);
  });
});

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
