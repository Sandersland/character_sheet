// Small SRD-derived rules tables + pure derivation helpers used by character
// creation. This is the backend's only home for this data — mirrors how
// src/lib/experience.ts is the only place the XP table lives. The frontend
// must not duplicate these tables; it gets the catalog data it needs (race
// speed, class hit die, etc.) from GET /api/reference and the 18-skill
// ability mapping from its own existing frontend/src/lib/abilities.ts
// SKILL_LABELS (display-only, no rules logic).

export const ALIGNMENTS: readonly string[] = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

export interface SkillDefinition {
  name: string;
  ability: string;
}

// All 18 5e skills with their governing ability — the canonical mapping
// implicit in prisma/seed.ts's per-character skill arrays.
export const SKILLS: readonly SkillDefinition[] = [
  { name: "acrobatics", ability: "dexterity" },
  { name: "animalHandling", ability: "wisdom" },
  { name: "arcana", ability: "intelligence" },
  { name: "athletics", ability: "strength" },
  { name: "deception", ability: "charisma" },
  { name: "history", ability: "intelligence" },
  { name: "insight", ability: "wisdom" },
  { name: "intimidation", ability: "charisma" },
  { name: "investigation", ability: "intelligence" },
  { name: "medicine", ability: "wisdom" },
  { name: "nature", ability: "intelligence" },
  { name: "perception", ability: "wisdom" },
  { name: "performance", ability: "charisma" },
  { name: "persuasion", ability: "charisma" },
  { name: "religion", ability: "intelligence" },
  { name: "sleightOfHand", ability: "dexterity" },
  { name: "stealth", ability: "dexterity" },
  { name: "survival", ability: "wisdom" },
];

/** Standard 5e modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Parses a hit die string like "d8" into its face value (8). */
function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

export interface DeriveCharacterInput {
  abilityScores: Record<string, number>;
  skillProficiencies: string[];
}

export interface DeriveCharacterCatalog {
  race: { speed: number };
  characterClass: { hitDie: string; savingThrows: string[] };
}

export interface DerivedCharacterFields {
  speed: number;
  hitDice: { total: number; die: string };
  hitPoints: { current: number; max: number; temp: number };
  armorClass: number;
  initiativeBonus: number;
  savingThrowProficiencies: string[];
  skills: { name: string; ability: string; proficient: boolean }[];
  currency: { cp: number; sp: number; gp: number; pp: number };
  spellcasting: null;
  journal: never[];
}

// ---------------------------------------------------------------------------
// Starting equipment — per-class packages (2014 Basic Rules)
//
// These are rules data, so they live here (same reasoning as ALIGNMENTS and
// the XP table in experience.ts). The frontend gets these via
// GET /api/reference (reference.ts attaches them to each class row) and
// never needs to duplicate them.
// ---------------------------------------------------------------------------

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
};

/**
 * Each pack name maps to the individual catalog-item rows it expands into
 * when chosen as starting equipment (per the 2014 Basic Rules equipment packs
 * section). Packs still exist as single "gear" catalog Items too — this map
 * is only consulted by the starting-equipment resolver.
 */
export const PACK_CONTENTS: Record<string, FixedItemRef[]> = {
  "Dungeoneer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Crowbar" },
    { catalogName: "Hammer" },
    { catalogName: "Piton", quantity: 10 },
    { catalogName: "Torch", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Rations", quantity: 10 },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Explorer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Bedroll" },
    { catalogName: "Mess Kit" },
    { catalogName: "Tinderbox" },
    { catalogName: "Torch", quantity: 10 },
    { catalogName: "Rations", quantity: 10 },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Burglar's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Ball Bearings", quantity: 1000 },
    { catalogName: "String (10 ft)" },
    { catalogName: "Bell" },
    { catalogName: "Candle", quantity: 5 },
    { catalogName: "Crowbar" },
    { catalogName: "Hammer" },
    { catalogName: "Piton", quantity: 10 },
    { catalogName: "Hooded Lantern" },
    { catalogName: "Oil Flask", quantity: 2 },
    { catalogName: "Rations", quantity: 5 },
    { catalogName: "Tinderbox" },
    { catalogName: "Waterskin" },
    { catalogName: "Hempen Rope (50 ft)" },
  ],
  "Priest's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Blanket" },
    { catalogName: "Candle", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Alms Box" },
    { catalogName: "Incense Block", quantity: 2 },
    { catalogName: "Censer" },
    { catalogName: "Vestments" },
    { catalogName: "Rations", quantity: 2 },
    { catalogName: "Waterskin" },
  ],
  "Diplomat's Pack": [
    { catalogName: "Chest" },
    { catalogName: "Map Case", quantity: 2 },
    { catalogName: "Fine Clothes" },
    { catalogName: "Ink and Quill" },
    { catalogName: "Lamp" },
    { catalogName: "Oil Flask", quantity: 2 },
    { catalogName: "Paper Sheet", quantity: 5 },
    { catalogName: "Perfume Vial" },
    { catalogName: "Sealing Wax" },
    { catalogName: "Soap" },
  ],
  "Entertainer's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Bedroll" },
    { catalogName: "Costume Clothes", quantity: 2 },
    { catalogName: "Candle", quantity: 5 },
    { catalogName: "Rations", quantity: 5 },
    { catalogName: "Waterskin" },
    { catalogName: "Disguise Kit" },
  ],
  "Scholar's Pack": [
    { catalogName: "Backpack" },
    { catalogName: "Book of Lore" },
    { catalogName: "Ink and Quill" },
    { catalogName: "Parchment Sheet", quantity: 10 },
    { catalogName: "Tinderbox" },
    { catalogName: "Knife" },
  ],
};

/**
 * Derives a newly-created level-1 character's mechanical fields from the
 * player's choices (ability scores, chosen skill proficiencies) plus the
 * resolved race/class catalog rows. Pure function — no DB access.
 */
export function deriveCreatedCharacter(
  input: DeriveCharacterInput,
  catalog: DeriveCharacterCatalog
): DerivedCharacterFields {
  const constitutionModifier = abilityModifier(input.abilityScores.constitution);
  const dexterityModifier = abilityModifier(input.abilityScores.dexterity);
  const maxHitPoints = Math.max(1, hitDieFace(catalog.characterClass.hitDie) + constitutionModifier);

  return {
    speed: catalog.race.speed,
    hitDice: { total: 1, die: catalog.characterClass.hitDie },
    hitPoints: { current: maxHitPoints, max: maxHitPoints, temp: 0 },
    armorClass: 10 + dexterityModifier,
    initiativeBonus: dexterityModifier,
    savingThrowProficiencies: catalog.characterClass.savingThrows,
    skills: SKILLS.map(({ name, ability }) => ({
      name,
      ability,
      proficient: input.skillProficiencies.includes(name),
    })),
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    spellcasting: null,
    journal: [],
  };
}
