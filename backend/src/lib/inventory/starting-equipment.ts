// Starting equipment — per-class packages (2014 Basic Rules).
//
// TODO(revisit): this lives here as an intermediate step while pack-contents
// have been migrated to the DB (Pack / PackContent tables, seeded in
// prisma/seed.ts). A future phase may migrate this nested choice-group /
// open-pick structure to the DB as well, once the schema design is worth
// the effort. For now the frontend gets this via GET /api/reference
// (reference.ts attaches each class row's entry) and pack expansion is
// handled server-side at character creation using the DB-backed packs.

export type WeaponClassName = "simple" | "martial";
export type WeaponRangeName = "melee" | "ranged";

/** Filter used for open picks — omitting a field means "any". */
export interface WeaponPoolFilter {
  weaponClass?: WeaponClassName;
  range?: WeaponRangeName;
}

/** Reference to a concrete catalog Item by its unique name, with a quantity. */
export interface FixedItemRef {
  catalogName: string;
  quantity?: number; // default 1
}

/** An open pick from the weapon pool, e.g. "any martial weapon". */
export interface OpenWeaponPick {
  label: string;
  filter: WeaponPoolFilter;
  quantity?: number; // default 1
}

/**
 * One selectable bundle within a choice group — a set of fixed items plus
 * zero or more open picks the player fills in from the filtered catalog.
 */
export interface EquipmentBundle {
  label: string;
  items?: FixedItemRef[];
  openPicks?: OpenWeaponPick[];
}

/**
 * A choice group within a class's starting equipment.
 * options.length === 1 → auto-granted (no player choice needed).
 * options.length > 1  → player picks exactly one bundle.
 */
export interface EquipmentChoiceGroup {
  label: string;
  options: EquipmentBundle[];
}

/** Dice expression for starting gold: roll diceCount×dFaces, multiply. */
export interface StartingGold {
  diceCount: number;
  diceFaces: number;
  multiplier: number;
}

export interface ClassStartingEquipment {
  groups: EquipmentChoiceGroup[];
  gold: StartingGold;
}

export const STARTING_EQUIPMENT: Record<string, ClassStartingEquipment> = {
  Fighter: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
        options: [
          { label: "Chain Mail", items: [{ catalogName: "Chain Mail" }] },
          {
            label: "Leather Armor, Longbow, and 20 Arrows",
            items: [
              { catalogName: "Leather Armor" },
              { catalogName: "Longbow" },
              { catalogName: "Arrows", quantity: 20 },
            ],
          },
        ],
      },
      {
        label: "(a) a martial weapon and a shield or (b) two martial weapons",
        options: [
          {
            label: "A martial weapon and a shield",
            items: [{ catalogName: "Shield" }],
            openPicks: [{ label: "any martial weapon", filter: { weaponClass: "martial" } }],
          },
          {
            label: "Two martial weapons",
            openPicks: [
              { label: "first martial weapon", filter: { weaponClass: "martial" } },
              { label: "second martial weapon", filter: { weaponClass: "martial" } },
            ],
          },
        ],
      },
      {
        label: "(a) a light crossbow and 20 bolts or (b) two handaxes",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          { label: "Two Handaxes", items: [{ catalogName: "Handaxe", quantity: 2 }] },
        ],
      },
      {
        label: "(a) a dungeoneer's pack or (b) an explorer's pack",
        options: [
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
    ],
  },

  Wizard: {
    gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a quarterstaff or (b) a dagger",
        options: [
          { label: "Quarterstaff", items: [{ catalogName: "Quarterstaff" }] },
          { label: "Dagger", items: [{ catalogName: "Dagger" }] },
        ],
      },
      {
        label: "(a) a component pouch or (b) an arcane focus",
        options: [
          { label: "Component Pouch", items: [{ catalogName: "Component Pouch" }] },
          { label: "Arcane Focus (Pearl)", items: [{ catalogName: "Pearl (arcane focus)" }] },
        ],
      },
      {
        label: "(a) a scholar's pack or (b) an explorer's pack",
        options: [
          { label: "Scholar's Pack", items: [{ catalogName: "Scholar's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted — no choice
        label: "A spellbook",
        options: [{ label: "Spellbook", items: [{ catalogName: "Spellbook" }] }],
      },
    ],
  },

  Rogue: {
    gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a rapier or (b) a shortsword",
        options: [
          { label: "Rapier", items: [{ catalogName: "Rapier" }] },
          { label: "Shortsword", items: [{ catalogName: "Shortsword" }] },
        ],
      },
      {
        label: "(a) a shortbow and quiver of 20 arrows or (b) a shortsword",
        options: [
          {
            label: "Shortbow and 20 Arrows",
            items: [{ catalogName: "Shortbow" }, { catalogName: "Arrows", quantity: 20 }],
          },
          { label: "Shortsword", items: [{ catalogName: "Shortsword" }] },
        ],
      },
      {
        label: "(a) a burglar's pack, (b) dungeoneer's pack, or (c) explorer's pack",
        options: [
          { label: "Burglar's Pack", items: [{ catalogName: "Burglar's Pack" }] },
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "Leather armor, two daggers, and thieves' tools",
        options: [
          {
            label: "Leather Armor, Two Daggers, Thieves' Tools",
            items: [
              { catalogName: "Leather Armor" },
              { catalogName: "Dagger", quantity: 2 },
              { catalogName: "Thieves' Tools" },
            ],
          },
        ],
      },
    ],
  },

  Cleric: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a mace or (b) a warhammer (if proficient)",
        options: [
          { label: "Mace", items: [{ catalogName: "Mace" }] },
          { label: "Warhammer", items: [{ catalogName: "Warhammer" }] },
        ],
      },
      {
        label: "(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)",
        options: [
          { label: "Scale Mail", items: [{ catalogName: "Scale Mail" }] },
          { label: "Leather Armor", items: [{ catalogName: "Leather Armor" }] },
          { label: "Chain Mail", items: [{ catalogName: "Chain Mail" }] },
        ],
      },
      {
        label: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a priest's pack or (b) an explorer's pack",
        options: [
          { label: "Priest's Pack", items: [{ catalogName: "Priest's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "A shield and a holy symbol",
        options: [
          {
            label: "Shield and Holy Symbol",
            items: [{ catalogName: "Shield" }, { catalogName: "Holy Symbol" }],
          },
        ],
      },
    ],
  },

  Barbarian: {
    gold: { diceCount: 2, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a greataxe or (b) any martial melee weapon",
        options: [
          { label: "Greataxe", items: [{ catalogName: "Greataxe" }] },
          {
            label: "Any martial melee weapon",
            openPicks: [{ label: "any martial melee weapon", filter: { weaponClass: "martial", range: "melee" } }],
          },
        ],
      },
      {
        label: "(a) two handaxes or (b) any simple weapon",
        options: [
          { label: "Two Handaxes", items: [{ catalogName: "Handaxe", quantity: 2 }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        // Auto-granted
        label: "An explorer's pack and four javelins",
        options: [
          {
            label: "Explorer's Pack and 4 Javelins",
            items: [{ catalogName: "Explorer's Pack" }, { catalogName: "Javelin", quantity: 4 }],
          },
        ],
      },
    ],
  },

  Bard: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a rapier, (b) a longsword, or (c) any simple weapon",
        options: [
          { label: "Rapier", items: [{ catalogName: "Rapier" }] },
          { label: "Longsword", items: [{ catalogName: "Longsword" }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a diplomat's pack or (b) an entertainer's pack",
        options: [
          { label: "Diplomat's Pack", items: [{ catalogName: "Diplomat's Pack" }] },
          { label: "Entertainer's Pack", items: [{ catalogName: "Entertainer's Pack" }] },
        ],
      },
      {
        label: "(a) a lute or (b) any other musical instrument",
        options: [
          { label: "Lute", items: [{ catalogName: "Lute" }] },
          {
            // Treat as a free open instrument pick — modeled as a simple gear
            // item; the filter here is permissive (any gear, by instrument tag)
            // but since the catalog only has one instrument we just offer it.
            label: "Lute (only instrument in catalog)",
            items: [{ catalogName: "Lute" }],
          },
        ],
      },
      {
        // Auto-granted
        label: "Leather armor and a dagger",
        options: [
          {
            label: "Leather Armor and Dagger",
            items: [{ catalogName: "Leather Armor" }, { catalogName: "Dagger" }],
          },
        ],
      },
    ],
  },

  Druid: {
    gold: { diceCount: 2, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a wooden shield or (b) any simple weapon",
        options: [
          { label: "Wooden Shield", items: [{ catalogName: "Shield" }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a scimitar or (b) any simple melee weapon",
        options: [
          { label: "Scimitar", items: [{ catalogName: "Scimitar" }] },
          {
            label: "Any simple melee weapon",
            openPicks: [{ label: "any simple melee weapon", filter: { weaponClass: "simple", range: "melee" } }],
          },
        ],
      },
      {
        // Auto-granted
        label: "Leather armor, an explorer's pack, and a druidic focus",
        options: [
          {
            label: "Leather Armor, Explorer's Pack, and Druidic Focus",
            items: [
              { catalogName: "Leather Armor" },
              { catalogName: "Explorer's Pack" },
              { catalogName: "Druidic Focus" },
            ],
          },
        ],
      },
    ],
  },

  Monk: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 1 },
    groups: [
      {
        label: "(a) a shortsword or (b) any simple weapon",
        options: [
          { label: "Shortsword", items: [{ catalogName: "Shortsword" }] },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a dungeoneer's pack or (b) an explorer's pack",
        options: [
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "10 darts",
        options: [{ label: "10 Darts", items: [{ catalogName: "Dart", quantity: 10 }] }],
      },
    ],
  },

  Paladin: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a martial weapon and a shield or (b) two martial weapons",
        options: [
          {
            label: "A martial weapon and a shield",
            items: [{ catalogName: "Shield" }],
            openPicks: [{ label: "any martial weapon", filter: { weaponClass: "martial" } }],
          },
          {
            label: "Two martial weapons",
            openPicks: [
              { label: "first martial weapon", filter: { weaponClass: "martial" } },
              { label: "second martial weapon", filter: { weaponClass: "martial" } },
            ],
          },
        ],
      },
      {
        label: "(a) five javelins or (b) any simple melee weapon",
        options: [
          { label: "Five Javelins", items: [{ catalogName: "Javelin", quantity: 5 }] },
          {
            label: "Any simple melee weapon",
            openPicks: [{ label: "any simple melee weapon", filter: { weaponClass: "simple", range: "melee" } }],
          },
        ],
      },
      {
        label: "(a) a priest's pack or (b) an explorer's pack",
        options: [
          { label: "Priest's Pack", items: [{ catalogName: "Priest's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "Chain mail and a holy symbol",
        options: [
          {
            label: "Chain Mail and Holy Symbol",
            items: [{ catalogName: "Chain Mail" }, { catalogName: "Holy Symbol" }],
          },
        ],
      },
    ],
  },

  Ranger: {
    gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) scale mail or (b) leather armor",
        options: [
          { label: "Scale Mail", items: [{ catalogName: "Scale Mail" }] },
          { label: "Leather Armor", items: [{ catalogName: "Leather Armor" }] },
        ],
      },
      {
        label: "(a) two shortswords or (b) two simple melee weapons",
        options: [
          { label: "Two Shortswords", items: [{ catalogName: "Shortsword", quantity: 2 }] },
          {
            label: "Two simple melee weapons",
            openPicks: [
              { label: "first simple melee weapon", filter: { weaponClass: "simple", range: "melee" } },
              { label: "second simple melee weapon", filter: { weaponClass: "simple", range: "melee" } },
            ],
          },
        ],
      },
      {
        label: "(a) a dungeoneer's pack or (b) an explorer's pack",
        options: [
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "A longbow and 20 arrows",
        options: [
          {
            label: "Longbow and 20 Arrows",
            items: [{ catalogName: "Longbow" }, { catalogName: "Arrows", quantity: 20 }],
          },
        ],
      },
    ],
  },

  Sorcerer: {
    gold: { diceCount: 3, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a component pouch or (b) an arcane focus",
        options: [
          { label: "Component Pouch", items: [{ catalogName: "Component Pouch" }] },
          { label: "Arcane Focus (Pearl)", items: [{ catalogName: "Pearl (arcane focus)" }] },
        ],
      },
      {
        label: "(a) a dungeoneer's pack or (b) an explorer's pack",
        options: [
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
          { label: "Explorer's Pack", items: [{ catalogName: "Explorer's Pack" }] },
        ],
      },
      {
        // Auto-granted
        label: "Two daggers",
        options: [{ label: "Two Daggers", items: [{ catalogName: "Dagger", quantity: 2 }] }],
      },
    ],
  },

  Warlock: {
    gold: { diceCount: 4, diceFaces: 4, multiplier: 10 },
    groups: [
      {
        label: "(a) a light crossbow and 20 bolts or (b) any simple weapon",
        options: [
          {
            label: "Light Crossbow and 20 Bolts",
            items: [{ catalogName: "Light Crossbow" }, { catalogName: "Crossbow Bolts", quantity: 20 }],
          },
          {
            label: "Any simple weapon",
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
      {
        label: "(a) a component pouch or (b) an arcane focus",
        options: [
          { label: "Component Pouch", items: [{ catalogName: "Component Pouch" }] },
          { label: "Arcane Focus (Pearl)", items: [{ catalogName: "Pearl (arcane focus)" }] },
        ],
      },
      {
        label: "(a) a scholar's pack or (b) a dungeoneer's pack",
        options: [
          { label: "Scholar's Pack", items: [{ catalogName: "Scholar's Pack" }] },
          { label: "Dungeoneer's Pack", items: [{ catalogName: "Dungeoneer's Pack" }] },
        ],
      },
      {
        // Auto-granted — leather armor, a simple weapon of choice, and two daggers
        label: "Leather armor, any simple weapon, and two daggers",
        options: [
          {
            label: "Leather Armor, Any Simple Weapon, and Two Daggers",
            items: [{ catalogName: "Leather Armor" }, { catalogName: "Dagger", quantity: 2 }],
            openPicks: [{ label: "any simple weapon", filter: { weaponClass: "simple" } }],
          },
        ],
      },
    ],
  },
};
