import { describe, it, expect } from "vitest";

import { deriveSpellRow, runeState } from "@/lib/spellRow";
import type { Spell } from "@/types/character";

const leveled: Spell = {
  id: "s1",
  name: "Fireball",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  range: "150 ft",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  effectDiceCount: 8,
  effectDiceFaces: 6,
  damageType: "fire",
  upcastDicePerLevel: 1,
};

const cantrip: Spell = { ...leveled, id: "s2", name: "Fire Bolt", level: 0 };

const itemSpell: Spell = {
  ...leveled,
  id: "s3",
  level: 1,
  source: "item",
  item: {
    inventoryItemId: "inv-1",
    capabilityId: "cap-1",
    itemName: "Wand",
    castLevel: 1,
    resource: "perRestShort",
    usesRemaining: 1,
    usesTotal: 1,
    dcMode: "fixed",
    dc: 15,
    attackMode: "fixed",
    attack: null,
  },
};

describe("deriveSpellRow", () => {
  it("flags a leveled spell with no slots as no-budget", () => {
    const d = deriveSpellRow(leveled, []);
    expect(d.isCantrip).toBe(false);
    expect(d.noBudget).toBe(true);
    expect(d.isGranted).toBe(false);
    expect(d.item).toBeUndefined();
  });

  it("never marks a cantrip as no-budget even with no slots", () => {
    const d = deriveSpellRow(cantrip, []);
    expect(d.isCantrip).toBe(true);
    expect(d.noBudget).toBe(false);
  });

  it("treats an at-will item as available regardless of use counts", () => {
    const atWill: Spell = {
      ...itemSpell,
      item: { ...itemSpell.item!, resource: "atWill", usesRemaining: 0, usesTotal: 0 },
    };
    const d = deriveSpellRow(atWill, []);
    expect(d.atWill).toBe(true);
    expect(d.itemExhausted).toBe(false);
    expect(d.noBudget).toBe(false);
    expect(d.isGranted).toBe(true);
  });

  it("exhausts a charges item when remaining can't cover the cost", () => {
    const charges: Spell = {
      ...itemSpell,
      item: { ...itemSpell.item!, resource: "charges", usesRemaining: 2, usesTotal: 7, chargeCost: 3 },
    };
    const d = deriveSpellRow(charges, []);
    expect(d.chargeCost).toBe(3);
    expect(d.itemExhausted).toBe(true);
    expect(d.noBudget).toBe(true);
  });

  it("keeps a charges item available when the pool covers the cost", () => {
    const charges: Spell = {
      ...itemSpell,
      item: { ...itemSpell.item!, resource: "charges", usesRemaining: 4, usesTotal: 7, chargeCost: 3 },
    };
    expect(deriveSpellRow(charges, []).itemExhausted).toBe(false);
  });

  it("marks subclass-granted spells as granted", () => {
    const d = deriveSpellRow({ ...cantrip, source: "subclass" }, []);
    expect(d.isGranted).toBe(true);
  });

  it("falls back to neutral tone for an unknown school", () => {
    const d = deriveSpellRow({ ...leveled, school: "mystery" as Spell["school"] }, [3]);
    expect(d.schoolTone).toBe("neutral");
  });
});

describe("runeState", () => {
  it("locks a cantrip (always prepared)", () => {
    expect(runeState(cantrip)).toBe("locked");
  });

  it("locks a subclass-granted spell", () => {
    expect(runeState({ ...leveled, source: "subclass" })).toBe("locked");
  });

  it("locks an item-granted spell", () => {
    expect(runeState(itemSpell)).toBe("locked");
  });

  it("reports a prepared leveled spell", () => {
    expect(runeState({ ...leveled, prepared: true })).toBe("prepared");
  });

  it("reports a known-but-unprepared leveled spell", () => {
    expect(runeState({ ...leveled, prepared: false })).toBe("unprepared");
  });
});
