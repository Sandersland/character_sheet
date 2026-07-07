import { describe, it, expect } from "vitest";

import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  type ItemSpellSourceItem,
} from "../granted-spells.js";

// A minimal castSpell capability row (flat columns + id) for deriveItemSpells.
function castSpellCap(id: string, spellId: string, over: Partial<ItemSpellSourceItem["capabilities"][number]> = {}) {
  return {
    id,
    kind: "castSpell",
    spellId,
    spellName: "Item Spell",
    spellLevel: 1,
    castLevel: 1,
    castResource: "perRestLong",
    castUses: 1,
    castConcentration: false,
    dcMode: "fixed",
    dcValue: 13,
    attackMode: "fixed",
    attackValue: 5,
    used: 0,
    ...over,
  } as ItemSpellSourceItem["capabilities"][number];
}

describe("deriveGrantedSpells", () => {
  it("grants Minor Illusion to a Way of Shadow monk at level 3", () => {
    const granted = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    expect(granted).toHaveLength(1);
    const [spell] = granted;
    expect(spell.name).toBe("Minor Illusion");
    expect(spell.level).toBe(0);
    expect(spell.school).toBe("illusion");
    expect(spell.source).toBe("subclass");
    expect(spell.prepared).toBe(true);
    expect(spell.id).toBe("granted:way-of-shadow:minor-illusion");
  });

  it("grants nothing below the gate level", () => {
    expect(deriveGrantedSpells("Monk", "Way of Shadow", 2)).toEqual([]);
  });

  it("grants nothing for a monk subclass with no granted spells", () => {
    expect(deriveGrantedSpells("Monk", "Way of the Open Hand", 3)).toEqual([]);
  });

  it("grants nothing for a non-monk with no relevant subclass", () => {
    expect(deriveGrantedSpells("Fighter", undefined, 20)).toEqual([]);
  });

  it("returns independent nested components objects across calls", () => {
    const first = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    const second = deriveGrantedSpells("Monk", "Way of Shadow", 3);
    expect(first[0].components).not.toBe(second[0].components);
    first[0].components!.verbal = false;
    expect(second[0].components!.verbal).toBe(true);
  });
});

describe("deriveItemSpells (#528)", () => {
  it("gives two castSpell caps for the SAME spell on one item distinct entry ids", () => {
    const item: ItemSpellSourceItem = {
      id: "inv-1",
      name: "Staff of Twin Bolts",
      equipped: false,
      attuned: true,
      capabilities: [castSpellCap("cap-a", "spell-witch-bolt"), castSpellCap("cap-b", "spell-witch-bolt")],
    };
    const spells = deriveItemSpells([item]);
    expect(spells).toHaveLength(2);
    const ids = spells.map((s) => s.id);
    expect(new Set(ids).size).toBe(2); // no collision
    expect(ids).toContain("item:inv-1:spell-witch-bolt:cap-a");
    expect(ids).toContain("item:inv-1:spell-witch-bolt:cap-b");
    // Each entry still points at its own capability for the cast op to resolve.
    expect(spells.map((s) => s.item?.capabilityId).sort()).toEqual(["cap-a", "cap-b"]);
  });

  it("omits an item that is neither equipped nor attuned", () => {
    const item: ItemSpellSourceItem = {
      id: "inv-2",
      name: "Dormant Wand",
      equipped: false,
      attuned: false,
      capabilities: [castSpellCap("cap-x", "spell-fire-bolt")],
    };
    expect(deriveItemSpells([item])).toEqual([]);
  });
});

describe("deriveGrantedCastingAbility", () => {
  it("returns the rule's casting ability for Way of Shadow", () => {
    expect(deriveGrantedCastingAbility("Way of Shadow")).toBe("wisdom");
  });

  it("defaults to wisdom for an unknown subclass", () => {
    expect(deriveGrantedCastingAbility("Way of the Open Hand")).toBe("wisdom");
  });

  it("defaults to wisdom when no subclass is set", () => {
    expect(deriveGrantedCastingAbility(undefined)).toBe("wisdom");
  });
});
