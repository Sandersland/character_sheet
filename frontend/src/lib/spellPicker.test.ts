import { describe, it, expect } from "vitest";

import {
  availableSlotLevels,
  availableArcanaLevels,
  isArcanumLevel,
  availableSlotsForSpell,
  resolvedSlot,
  spellRestrictionFlags,
  slotRestrictionHint,
  filterCastableSpells,
  sortSpells,
} from "@/lib/spellPicker";
import type { Spell, SpellSlots } from "@/types/character";

function spell(overrides: Partial<Spell>): Spell {
  return {
    id: "s",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "",
    ...overrides,
  } as Spell;
}

const slots: SpellSlots[] = [
  { level: 1, total: 2, used: 1 },
  { level: 2, total: 1, used: 0 },
  { level: 3, total: 1, used: 1 },
];

describe("availableSlotLevels", () => {
  it("returns ascending levels that still have a use remaining", () => {
    expect(availableSlotLevels(slots)).toEqual([1, 2]);
  });
});

describe("availableArcanaLevels / isArcanumLevel", () => {
  const arcana: SpellSlots[] = [
    { level: 6, total: 1, used: 0 },
    { level: 7, total: 1, used: 1 },
  ];

  it("lists arcana levels with a charge remaining", () => {
    expect(availableArcanaLevels(arcana)).toEqual([6]);
  });

  it("isArcanumLevel matches only available arcanum levels", () => {
    const levels = availableArcanaLevels(arcana);
    expect(isArcanumLevel(6, levels)).toBe(true);
    expect(isArcanumLevel(7, levels)).toBe(false);
    expect(isArcanumLevel(undefined, levels)).toBe(false);
  });
});

describe("availableSlotsForSpell", () => {
  it("returns [] for a cantrip", () => {
    expect(availableSlotsForSpell(spell({ level: 0 }), [1, 2], [])).toEqual([]);
  });

  it("returns slot levels at or above the spell level", () => {
    expect(availableSlotsForSpell(spell({ level: 1 }), [1, 2], [])).toEqual([1, 2]);
    expect(availableSlotsForSpell(spell({ level: 2 }), [1, 2], [])).toEqual([2]);
  });

  it("adds a Mystic Arcanum level even without a matching slot", () => {
    expect(availableSlotsForSpell(spell({ level: 6 }), [1, 2], [6])).toEqual([6]);
  });
});

describe("resolvedSlot", () => {
  it("is undefined for a cantrip", () => {
    expect(resolvedSlot(spell({ level: 0 }), undefined, [1, 2], [])).toBeUndefined();
  });

  it("honours the chosen level", () => {
    expect(resolvedSlot(spell({ level: 1 }), 2, [1, 2], [])).toBe(2);
  });

  it("falls back to the lowest available level", () => {
    expect(resolvedSlot(spell({ level: 1 }), undefined, [1, 2], [])).toBe(1);
  });
});

describe("spellRestrictionFlags", () => {
  it("blocks bonus-action casting after a leveled action spell", () => {
    expect(spellRestrictionFlags("bonusAction", { action: "leveled" })).toEqual({
      bonusActionBlockedByActionSpell: true,
      actionLimitedToCantrips: false,
    });
  });

  it("limits the action to cantrips after a leveled bonus-action spell", () => {
    expect(spellRestrictionFlags("action", { bonus: "leveled" })).toEqual({
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: true,
    });
  });

  it("is unrestricted otherwise", () => {
    expect(spellRestrictionFlags("action", {})).toEqual({
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: false,
    });
  });
});

describe("slotRestrictionHint", () => {
  it("returns the block message when bonus-action casting is blocked", () => {
    expect(slotRestrictionHint(true, false)).toMatch(/bonus-action spell casting is not allowed/i);
  });

  it("returns the cantrip-only message when limited", () => {
    expect(slotRestrictionHint(false, true)).toMatch(/only cantrips may be cast/i);
  });

  it("returns null when unrestricted", () => {
    expect(slotRestrictionHint(false, false)).toBeNull();
  });
});

describe("filterCastableSpells", () => {
  const base = {
    slotLevels: [1, 2],
    arcanaLevels: [] as number[],
    bonusActionBlockedByActionSpell: false,
    actionLimitedToCantrips: false,
  };
  const cantrip = spell({ id: "c", level: 0 });
  const preparedL1 = spell({ id: "p", level: 1, prepared: true });
  const unpreparedL1 = spell({ id: "u", level: 1, prepared: false });

  it("keeps cantrips and prepared leveled spells with an available slot", () => {
    const out = filterCastableSpells([cantrip, preparedL1, unpreparedL1], base);
    expect(out.map((s) => s.id)).toEqual(["c", "p"]);
  });

  it("drops leveled spells when no slot is high enough (unless arcanum)", () => {
    const out = filterCastableSpells([spell({ id: "l3", level: 3, prepared: true })], base);
    expect(out).toEqual([]);
    const arc = filterCastableSpells([spell({ id: "l6", level: 6, prepared: true })], {
      ...base,
      arcanaLevels: [6],
    });
    expect(arc.map((s) => s.id)).toEqual(["l6"]);
  });

  it("applies the casting-time filter to all spells", () => {
    const out = filterCastableSpells(
      [cantrip, spell({ id: "ba", level: 1, prepared: true, castingTime: "1 bonus action" })],
      { ...base, castingTimeFilter: "1 bonus action" },
    );
    expect(out.map((s) => s.id)).toEqual(["ba"]);
  });

  it("blocks everything when a bonus-action leveled spell was cast (block flag)", () => {
    expect(
      filterCastableSpells([cantrip, preparedL1], { ...base, bonusActionBlockedByActionSpell: true }),
    ).toEqual([]);
  });

  it("limits to cantrips when actionLimitedToCantrips is set", () => {
    const out = filterCastableSpells([cantrip, preparedL1], { ...base, actionLimitedToCantrips: true });
    expect(out.map((s) => s.id)).toEqual(["c"]);
  });
});

describe("sortSpells", () => {
  it("orders cantrips first, then by level, then by name", () => {
    const out = sortSpells([
      spell({ id: "b", name: "Bolt", level: 1 }),
      spell({ id: "c", name: "Cantrip", level: 0 }),
      spell({ id: "a", name: "Arc", level: 1 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});
