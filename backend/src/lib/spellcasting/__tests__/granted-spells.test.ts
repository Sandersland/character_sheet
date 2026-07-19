import { describe, it, expect } from "vitest";

import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  grantedSpellsGained,
  type GrantedSpellSource,
  type GrantedSpellCatalogSpell,
  type ItemSpellSourceItem,
} from "@/lib/spellcasting/granted-spells.js";

// A catalog Spell row as loaded via `subclassRef.grantedSpells.spell`. Defaults to
// a utility cantrip (Minor Illusion shape); override for damage-grant coverage.
function catalogSpell(over: Partial<GrantedSpellCatalogSpell> = {}): GrantedSpellCatalogSpell {
  return {
    name: "Minor Illusion",
    level: 0,
    school: "illusion",
    castingTime: "1 action",
    range: "30 ft",
    duration: "1 minute",
    description: "Create a sound or an image of an object within range.",
    concentration: false,
    ritual: false,
    components: { verbal: true, somatic: true, material: true, materialDescription: "a bit of fleece" },
    effectKind: null,
    effectDiceCount: null,
    effectDiceFaces: null,
    effectModifier: null,
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    upcastDicePerLevel: null,
    cantripScaling: false,
    buffTarget: null,
    buffModifier: null,
    ...over,
  };
}

// Way of Shadow → Minor Illusion, as the loaded subclassRef would supply it.
const wayOfShadow: GrantedSpellSource = {
  name: "Way of Shadow",
  grantedSpells: [{ gateLevel: 3, castingAbility: "wisdom", spell: catalogSpell() }],
};

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
  it("grants Minor Illusion to a Way of Shadow monk at level 3 (parity with the retired snapshot)", () => {
    const granted = deriveGrantedSpells(wayOfShadow, 3);
    expect(granted).toHaveLength(1);
    const [spell] = granted;
    expect(spell.name).toBe("Minor Illusion");
    expect(spell.level).toBe(0);
    expect(spell.school).toBe("illusion");
    expect(spell.source).toBe("subclass");
    expect(spell.prepared).toBe(true);
    expect(spell.id).toBe("granted:way-of-shadow:minor-illusion");
    // A utility grant carries no concentration/effect keys (byte-shape parity).
    expect(spell.concentration).toBeUndefined();
    expect(spell.effectKind).toBeUndefined();
  });

  it("grants nothing below the gate level", () => {
    expect(deriveGrantedSpells(wayOfShadow, 2)).toEqual([]);
  });

  it("grants nothing for a null source (no subclass / homebrew without a catalog row)", () => {
    expect(deriveGrantedSpells(null, 20)).toEqual([]);
    expect(deriveGrantedSpells(undefined, 20)).toEqual([]);
  });

  it("grants nothing for a subclass with an empty grant list", () => {
    expect(deriveGrantedSpells({ name: "Way of the Open Hand", grantedSpells: [] }, 20)).toEqual([]);
  });

  it("returns independent nested components objects across calls", () => {
    const first = deriveGrantedSpells(wayOfShadow, 3);
    const second = deriveGrantedSpells(wayOfShadow, 3);
    expect(first[0].components).not.toBe(second[0].components);
    first[0].components!.verbal = false;
    expect(second[0].components!.verbal).toBe(true);
  });

  it("carries a damage grant's roll data through from the catalog (forward: #913)", () => {
    const source: GrantedSpellSource = {
      name: "Oath of Vengeance",
      grantedSpells: [
        {
          gateLevel: 9,
          castingAbility: "charisma",
          spell: catalogSpell({
            name: "Haste",
            level: 3,
            school: "transmutation",
            concentration: true,
            effectKind: "buff",
            components: { verbal: true, somatic: true, material: true },
          }),
        },
      ],
    };
    const [spell] = deriveGrantedSpells(source, 9);
    expect(spell.id).toBe("granted:oath-of-vengeance:haste");
    expect(spell.concentration).toBe(true);
    expect(spell.effectKind).toBe("buff");
  });
});

describe("grantedSpellsGained (#1139)", () => {
  // Gates at 1/3/5 — the Archfey shape, enough to cover crossing vs. non-crossing.
  const archfey: GrantedSpellSource = {
    name: "The Archfey",
    grantedSpells: [
      { gateLevel: 1, castingAbility: "charisma", spell: catalogSpell({ name: "Faerie Fire", level: 1 }) },
      { gateLevel: 3, castingAbility: "charisma", spell: catalogSpell({ name: "Calm Emotions", level: 2 }) },
      { gateLevel: 5, castingAbility: "charisma", spell: catalogSpell({ name: "Blink", level: 3 }) },
    ],
  };

  it("returns exactly the spells newly gated when a level-up crosses a gate", () => {
    const gained = grantedSpellsGained(archfey, 4, archfey, 5);
    expect(gained.map((s) => s.name)).toEqual(["Blink"]);
  });

  it("returns nothing for a level-up that crosses no gate", () => {
    expect(grantedSpellsGained(archfey, 3, archfey, 4)).toEqual([]);
  });

  it("counts every ≤-level grant as incoming for a fresh subclass pick (null prev)", () => {
    const gained = grantedSpellsGained(null, 4, archfey, 5);
    expect(gained.map((s) => s.name)).toEqual(["Faerie Fire", "Calm Emotions", "Blink"]);
  });

  it("returns nothing when there is no next source", () => {
    expect(grantedSpellsGained(archfey, 4, null, 5)).toEqual([]);
    expect(grantedSpellsGained(archfey, 4, undefined, 5)).toEqual([]);
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
  it("returns the grant's casting ability", () => {
    expect(deriveGrantedCastingAbility(wayOfShadow)).toBe("wisdom");
  });

  it("defaults to wisdom for a source with no grants", () => {
    expect(deriveGrantedCastingAbility({ name: "Way of the Open Hand", grantedSpells: [] })).toBe("wisdom");
  });

  it("defaults to wisdom when no source is set", () => {
    expect(deriveGrantedCastingAbility(null)).toBe("wisdom");
    expect(deriveGrantedCastingAbility(undefined)).toBe("wisdom");
  });

  it("rejects an invalid (mis-cased / unknown) casting ability and defaults to wisdom", () => {
    const bad: GrantedSpellSource = {
      name: "Homebrew",
      grantedSpells: [{ gateLevel: 3, castingAbility: "Wisdom", spell: catalogSpell() }], // capital W = invalid key
    };
    expect(deriveGrantedCastingAbility(bad)).toBe("wisdom");
    const garbage: GrantedSpellSource = {
      name: "Homebrew",
      grantedSpells: [{ gateLevel: 3, castingAbility: "luck", spell: catalogSpell() }],
    };
    expect(deriveGrantedCastingAbility(garbage)).toBe("wisdom");
  });
});
