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
  groupSpellsByLevel,
  hiddenSpellLevels,
  slotPipsForLevel,
  hiddenLevelsNote,
  castCostBadge,
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

describe("groupSpellsByLevel", () => {
  it("groups a sorted list into contiguous level sections", () => {
    const out = groupSpellsByLevel([
      spell({ id: "c1", level: 0 }),
      spell({ id: "c2", level: 0 }),
      spell({ id: "a", level: 1 }),
      spell({ id: "b", level: 3 }),
    ]);
    expect(out.map((g) => ({ level: g.level, ids: g.spells.map((s) => s.id) }))).toEqual([
      { level: 0, ids: ["c1", "c2"] },
      { level: 1, ids: ["a"] },
      { level: 3, ids: ["b"] },
    ]);
  });

  it("returns [] for no spells", () => {
    expect(groupSpellsByLevel([])).toEqual([]);
  });
});

describe("hiddenSpellLevels", () => {
  const base = {
    slotLevels: [1],
    arcanaLevels: [] as number[],
    bonusActionBlockedByActionSpell: false,
    actionLimitedToCantrips: false,
  };

  it("reports prepared leveled spells whose level has no affordable slot", () => {
    const out = hiddenSpellLevels(
      [
        spell({ id: "l1", level: 1, prepared: true }),
        spell({ id: "l2", level: 2, prepared: true }),
        spell({ id: "l3", level: 3, prepared: true }),
      ],
      base,
    );
    expect(out).toEqual([2, 3]);
  });

  it("ignores cantrips, unprepared spells, and casting-time mismatches", () => {
    const out = hiddenSpellLevels(
      [
        spell({ id: "c", level: 0 }),
        spell({ id: "u", level: 2, prepared: false }),
        spell({ id: "b", level: 2, prepared: true, castingTime: "1 bonus action" }),
      ],
      { ...base, castingTimeFilter: "1 action" },
    );
    expect(out).toEqual([]);
  });

  it("an arcanum charge makes its level affordable", () => {
    const out = hiddenSpellLevels(
      [spell({ id: "l6", level: 6, prepared: true })],
      { ...base, arcanaLevels: [6] },
    );
    expect(out).toEqual([]);
  });
});

describe("slotPipsForLevel", () => {
  it("returns the level's total/used, null for cantrips or missing levels", () => {
    expect(slotPipsForLevel(slots, 1)).toEqual({ total: 2, used: 1 });
    expect(slotPipsForLevel(slots, 0)).toBeNull();
    expect(slotPipsForLevel(slots, 9)).toBeNull();
  });
});

describe("hiddenLevelsNote", () => {
  it("contiguous levels collapse to 'Level N+'", () => {
    expect(hiddenLevelsNote([2, 3, 4])).toBe("Level 2+ hidden — no slots remaining");
    expect(hiddenLevelsNote([2])).toBe("Level 2+ hidden — no slots remaining");
  });

  it("non-contiguous levels are listed", () => {
    expect(hiddenLevelsNote([2, 4])).toBe("Levels 2, 4 hidden — no slots remaining");
  });

  it("null when nothing is hidden", () => {
    expect(hiddenLevelsNote([])).toBeNull();
  });
});

describe("castCostBadge", () => {
  it("cantrips are free, leveled spells cost a slot", () => {
    expect(castCostBadge(spell({ level: 0, castingTime: "1 action" }))).toBe("free · action");
    expect(castCostBadge(spell({ level: 1, castingTime: "1 action" }))).toBe("1 slot · action");
  });

  it("derives the cost word from the casting time", () => {
    expect(castCostBadge(spell({ level: 1, castingTime: "1 bonus action" }))).toBe(
      "1 slot · bonus action",
    );
    expect(
      castCostBadge(spell({ level: 1, castingTime: "1 reaction, which you take when you are hit" })),
    ).toBe("1 slot · reaction");
    expect(castCostBadge(spell({ level: 3, castingTime: "1 minute" }))).toBe("1 slot · 1 minute");
  });
});
