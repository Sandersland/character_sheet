import { describe, it, expect } from "vitest";

import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  grantedSpellsGained,
  buildSpeciesGrantedSpellSource,
  type GrantedSpellSource,
  type GrantedSpellCatalogSpell,
  type ItemSpellSourceItem,
  type SpeciesGrantSourceInput,
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

// Warrior of Shadow → Minor Illusion, as the loaded subclassRef would supply it.
const warriorOfShadow: GrantedSpellSource = {
  name: "Warrior of Shadow",
  grantedSpells: [{ gateLevel: 3, castingAbility: "wisdom", edition: null, spell: catalogSpell() }],
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
  it("grants Minor Illusion to a Warrior of Shadow monk at level 3 (parity with the retired snapshot)", () => {
    const granted = deriveGrantedSpells(warriorOfShadow, 3, "EDITION_2024");
    expect(granted).toHaveLength(1);
    const [spell] = granted;
    expect(spell.name).toBe("Minor Illusion");
    expect(spell.level).toBe(0);
    expect(spell.school).toBe("illusion");
    expect(spell.source).toBe("subclass");
    expect(spell.prepared).toBe(true);
    expect(spell.id).toBe("granted:warrior-of-shadow:minor-illusion");
    // A utility grant carries no concentration/effect keys (byte-shape parity).
    expect(spell.concentration).toBeUndefined();
    expect(spell.effectKind).toBeUndefined();
  });

  it("grants nothing below the gate level", () => {
    expect(deriveGrantedSpells(warriorOfShadow, 2, "EDITION_2024")).toEqual([]);
  });

  it("grants nothing for a null source (no subclass / homebrew without a catalog row)", () => {
    expect(deriveGrantedSpells(null, 20, "EDITION_2024")).toEqual([]);
    expect(deriveGrantedSpells(undefined, 20, "EDITION_2024")).toEqual([]);
  });

  it("grants nothing for a subclass with an empty grant list", () => {
    expect(deriveGrantedSpells({ name: "Warrior of the Open Hand", grantedSpells: [] }, 20, "EDITION_2024")).toEqual([]);
  });

  it("returns independent nested components objects across calls", () => {
    const first = deriveGrantedSpells(warriorOfShadow, 3, "EDITION_2024");
    const second = deriveGrantedSpells(warriorOfShadow, 3, "EDITION_2024");
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
          edition: null,
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
    const [spell] = deriveGrantedSpells(source, 9, "EDITION_2024");
    expect(spell.id).toBe("granted:oath-of-vengeance:haste");
    expect(spell.concentration).toBe(true);
    expect(spell.effectKind).toBe("buff");
  });

  // #1625: the loaded grantedSpells rows span every edition; the set filter
  // (shared-or-own-edition) lives in this module and nowhere else.
  describe("edition filter (#1625)", () => {
    const forked: GrantedSpellSource = {
      name: "Oath of Devotion",
      grantedSpells: [
        { gateLevel: 3, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Protection from Evil and Good", level: 1 }) },
        { gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2014", spell: catalogSpell({ name: "Sanctuary", level: 1 }) },
        { gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024", spell: catalogSpell({ name: "Shield of Faith", level: 1 }) },
      ],
    };

    it("serves a shared (NULL) row to both editions", () => {
      for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
        expect(deriveGrantedSpells(forked, 3, edition).map((s) => s.name)).toContain("Protection from Evil and Good");
      }
    });

    it("excludes a 2014-tagged row for a 2024 character and vice versa", () => {
      const for2024 = deriveGrantedSpells(forked, 3, "EDITION_2024").map((s) => s.name);
      expect(for2024).toContain("Shield of Faith");
      expect(for2024).not.toContain("Sanctuary");

      const for2014 = deriveGrantedSpells(forked, 3, "EDITION_2014").map((s) => s.name);
      expect(for2014).toContain("Sanctuary");
      expect(for2014).not.toContain("Shield of Faith");
    });

    it("a per-edition gateLevel fork of the SAME spell yields exactly one entry per edition, each at its own gate", () => {
      const gateFork: GrantedSpellSource = {
        name: "Fixture Oath",
        grantedSpells: [
          { gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2014", spell: catalogSpell({ name: "Misty Step", level: 2 }) },
          { gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024", spell: catalogSpell({ name: "Misty Step", level: 2 }) },
        ],
      };
      expect(deriveGrantedSpells(gateFork, 3, "EDITION_2014").map((s) => s.name)).toEqual(["Misty Step"]);
      expect(deriveGrantedSpells(gateFork, 3, "EDITION_2024")).toEqual([]);
      const at5For2024 = deriveGrantedSpells(gateFork, 5, "EDITION_2024");
      expect(at5For2024.map((s) => s.name)).toEqual(["Misty Step"]);
      expect(at5For2024).toHaveLength(1);
    });
  });
});

describe("grantedSpellsGained (#1139)", () => {
  // Gates at 1/3/5 — the Archfey shape, enough to cover crossing vs. non-crossing.
  const archfey: GrantedSpellSource = {
    name: "The Archfey",
    grantedSpells: [
      { gateLevel: 1, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Faerie Fire", level: 1 }) },
      { gateLevel: 3, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Calm Emotions", level: 2 }) },
      { gateLevel: 5, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Blink", level: 3 }) },
    ],
  };

  it("returns exactly the spells newly gated when a level-up crosses a gate", () => {
    const gained = grantedSpellsGained(archfey, 4, archfey, 5, "EDITION_2014");
    expect(gained.map((s) => s.name)).toEqual(["Blink"]);
  });

  it("returns nothing for a level-up that crosses no gate", () => {
    expect(grantedSpellsGained(archfey, 3, archfey, 4, "EDITION_2014")).toEqual([]);
  });

  it("counts every ≤-level grant as incoming for a fresh subclass pick (null prev)", () => {
    const gained = grantedSpellsGained(null, 4, archfey, 5, "EDITION_2014");
    expect(gained.map((s) => s.name)).toEqual(["Faerie Fire", "Calm Emotions", "Blink"]);
  });

  it("returns nothing when there is no next source", () => {
    expect(grantedSpellsGained(archfey, 4, null, 5, "EDITION_2014")).toEqual([]);
    expect(grantedSpellsGained(archfey, 4, undefined, 5, "EDITION_2014")).toEqual([]);
  });

  it("never reports a cross-edition row as gained (#1625)", () => {
    const forked: GrantedSpellSource = {
      name: "The Archfey",
      grantedSpells: [
        { gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2014", spell: catalogSpell({ name: "Blink", level: 3 }) },
        { gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024", spell: catalogSpell({ name: "Misty Step", level: 2 }) },
      ],
    };
    expect(grantedSpellsGained(forked, 4, forked, 5, "EDITION_2024").map((s) => s.name)).toEqual(["Misty Step"]);
    expect(grantedSpellsGained(forked, 4, forked, 5, "EDITION_2014").map((s) => s.name)).toEqual(["Blink"]);
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
    expect(deriveGrantedCastingAbility(warriorOfShadow, "EDITION_2024")).toBe("wisdom");
  });

  it("defaults to wisdom for a source with no grants", () => {
    expect(deriveGrantedCastingAbility({ name: "Warrior of the Open Hand", grantedSpells: [] }, "EDITION_2024")).toBe("wisdom");
  });

  it("defaults to wisdom when no source is set", () => {
    expect(deriveGrantedCastingAbility(null, "EDITION_2024")).toBe("wisdom");
    expect(deriveGrantedCastingAbility(undefined, "EDITION_2024")).toBe("wisdom");
  });

  it("reads the first ADMITTED grant's ability, skipping cross-edition rows (#1625)", () => {
    const forked: GrantedSpellSource = {
      name: "Fixture Domain",
      grantedSpells: [
        { gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2014", spell: catalogSpell() },
        { gateLevel: 3, castingAbility: "intelligence", edition: null, spell: catalogSpell({ name: "Elementalism" }) },
      ],
    };
    // The 2014-tagged charisma row is not admitted for a 2024 character.
    expect(deriveGrantedCastingAbility(forked, "EDITION_2024")).toBe("intelligence");
    expect(deriveGrantedCastingAbility(forked, "EDITION_2014")).toBe("charisma");
  });

  it("rejects an invalid (mis-cased / unknown) casting ability and defaults to wisdom", () => {
    const bad: GrantedSpellSource = {
      name: "Homebrew",
      grantedSpells: [{ gateLevel: 3, castingAbility: "Wisdom", edition: null, spell: catalogSpell() }], // capital W = invalid key
    };
    expect(deriveGrantedCastingAbility(bad, "EDITION_2024")).toBe("wisdom");
    const garbage: GrantedSpellSource = {
      name: "Homebrew",
      grantedSpells: [{ gateLevel: 3, castingAbility: "luck", edition: null, spell: catalogSpell() }],
    };
    expect(deriveGrantedCastingAbility(garbage, "EDITION_2024")).toBe("wisdom");
  });
});

// #1683: deriveGrantedSpells STAYS ONE FUNCTION serving both subclass and
// species sources — sourceKind only changes the `source` literal it stamps
// onto each derived SpellEntry, never a second derivation path.
describe("deriveGrantedSpells sourceKind parameter (#1683)", () => {
  it("defaults to source: \"subclass\" when sourceKind is omitted (existing call sites unchanged)", () => {
    const [spell] = deriveGrantedSpells(warriorOfShadow, 3, "EDITION_2024");
    expect(spell.source).toBe("subclass");
  });

  it("stamps source: \"species\" when sourceKind is \"species\", same derivation otherwise", () => {
    const drow: GrantedSpellSource = {
      name: "Drow",
      grantedSpells: [
        { gateLevel: 1, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Dancing Lights" }) },
        { gateLevel: 3, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Faerie Fire", level: 1 }) },
        { gateLevel: 5, castingAbility: "charisma", edition: null, spell: catalogSpell({ name: "Darkness", level: 2 }) },
      ],
    };
    const at1 = deriveGrantedSpells(drow, 1, "EDITION_2024", "species");
    expect(at1.map((s) => s.name)).toEqual(["Dancing Lights"]);
    expect(at1[0].source).toBe("species");
    expect(at1[0].prepared).toBe(true);

    const at3 = deriveGrantedSpells(drow, 3, "EDITION_2024", "species");
    expect(at3.map((s) => s.name)).toEqual(["Dancing Lights", "Faerie Fire"]);

    const at5 = deriveGrantedSpells(drow, 5, "EDITION_2024", "species");
    expect(at5.map((s) => s.name)).toEqual(["Dancing Lights", "Faerie Fire", "Darkness"]);

    // Level-down (5 -> 2): Faerie Fire/Darkness drop out — no persistence, the
    // exact same re-derive-on-read the subclass path already relies on.
    const backDownAt2 = deriveGrantedSpells(drow, 2, "EDITION_2024", "species");
    expect(backDownAt2.map((s) => s.name)).toEqual(["Dancing Lights"]);
  });
});

describe("buildSpeciesGrantedSpellSource (#1683)", () => {
  function grantRow(spellName: string, gateLevel: number, variantId: string | null = "variant-drow"): {
    variantId: string | null;
    gateLevel: number;
    spell: GrantedSpellCatalogSpell;
  } {
    return { variantId, gateLevel, spell: catalogSpell({ name: spellName }) };
  }

  it("returns null for a null input (no species picked)", () => {
    expect(buildSpeciesGrantedSpellSource(null)).toBeNull();
  });

  it("returns null when neither species-level nor variant-level rows exist (no lineage, or a non-spell-granting one)", () => {
    const input: SpeciesGrantSourceInput = {
      name: "Goliath",
      castingAbility: null,
      speciesGrantedSpells: [],
      variantGrantedSpells: [],
    };
    expect(buildSpeciesGrantedSpellSource(input)).toBeNull();
  });

  it("merges species-level (variantId: null) rows with the picked variant's own rows, mirroring activeTraitRows", () => {
    const input: SpeciesGrantSourceInput = {
      name: "Drow",
      castingAbility: "charisma",
      // The Species -> SpeciesGrantedSpell back-relation is UNFILTERED (same
      // Prisma relation gotcha activeTraitRows documents) — a genuine
      // species-level row (variantId: null) is included, a row belonging to
      // a DIFFERENT variant is excluded.
      speciesGrantedSpells: [grantRow("Light", 1, null), grantRow("Druidcraft", 1, "variant-wood")],
      variantGrantedSpells: [grantRow("Faerie Fire", 3, "variant-drow")],
    };
    const source = buildSpeciesGrantedSpellSource(input);
    expect(source?.grantedSpells.map((g) => g.spell.name)).toEqual(["Light", "Faerie Fire"]);
  });

  it("stamps every row with the character's chosen castingAbility and edition: null (species children carry no edition column)", () => {
    const input: SpeciesGrantSourceInput = {
      name: "Drow",
      castingAbility: "intelligence",
      speciesGrantedSpells: [],
      variantGrantedSpells: [grantRow("Dancing Lights", 1)],
    };
    const source = buildSpeciesGrantedSpellSource(input);
    expect(source?.grantedSpells[0].castingAbility).toBe("intelligence");
    expect(source?.grantedSpells[0].edition).toBeNull();
  });

  it("falls back to wisdom when castingAbility is null/unset (defense in depth — creation validation requires it whenever grants exist)", () => {
    const input: SpeciesGrantSourceInput = {
      name: "Drow",
      castingAbility: null,
      speciesGrantedSpells: [],
      variantGrantedSpells: [grantRow("Dancing Lights", 1)],
    };
    const source = buildSpeciesGrantedSpellSource(input);
    expect(source?.grantedSpells[0].castingAbility).toBe("wisdom");
  });

  it("the built source feeds deriveGrantedSpells with sourceKind \"species\" end to end", () => {
    const input: SpeciesGrantSourceInput = {
      name: "Drow",
      castingAbility: "charisma",
      speciesGrantedSpells: [],
      variantGrantedSpells: [grantRow("Dancing Lights", 1), grantRow("Faerie Fire", 3), grantRow("Darkness", 5)],
    };
    const source = buildSpeciesGrantedSpellSource(input);
    const granted = deriveGrantedSpells(source, 5, "EDITION_2024", "species");
    expect(granted.map((g) => g.name)).toEqual(["Dancing Lights", "Faerie Fire", "Darkness"]);
    expect(granted.every((g) => g.source === "species")).toBe(true);
  });
});
