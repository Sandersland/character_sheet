// --- StartingEquipmentPackage catalog (#1519/#1533) --------------------------
// Migrates the twelve classes' starting-equipment packages that live in
// backend/src/lib/inventory/starting-equipment.ts's STARTING_EQUIPMENT into
// seeded rows — a TRANSCRIPTION, not a rewrite: every package below is
// byte-for-byte the same content as its STARTING_EQUIPMENT twin, proven by
// starting-equipment-fidelity.test.ts's twelve toEqual assertions. Every
// citation is PHB'14 (p. 72 armor/weapons tables, p. 143 Starting Wealth) —
// no PHB'24 content is authored here (that's #1535, parked).
//
// Authored NESTED (the wire shape, ClassStartingEquipment) rather than as
// flat row literals: `position` is then just the array index (nothing to
// author, nothing to get wrong — #1545's lesson), and the seed validator
// (validate.ts) can validate the same tree the client renders. The seeder
// (seed-starting-equipment.ts) flattens this into the five relational tables.
//
// The 2024 half is an INTERIM verbatim copy of the 2014 half (same trick
// #1523 uses for ClassFeature) so no character is left without starting
// equipment mid-epic — see EDITIONS_STILL_IDENTICAL's sibling reasoning
// there. This is NOT "the 2024 content is real"; #1535 (parked) would be
// where genuine PHB'24 packages land, and it is out of scope here.
//
// DATA MODULE ONLY (#1277 AC 4, machine-enforced by
// scripts/check-seed-data-modules.sh): no direct database calls or async
// write logic may live in this file. The executable seeder is
// seed-starting-equipment.ts.
import { z } from "zod";

import type { ClassStartingEquipment } from "@character-sheet/shared-types";

import type { SeedEdition } from "./edition.js";

const weaponClassSchema = z.enum(["simple", "martial"]);
const weaponRangeSchema = z.enum(["melee", "ranged"]);

const fixedItemSchema = z.object({
  catalogName: z.string().min(1),
  quantity: z.number().int().positive().optional(),
});

const openWeaponPickSchema = z.object({
  label: z.string().min(1),
  filter: z.object({
    weaponClass: weaponClassSchema.optional(),
    range: weaponRangeSchema.optional(),
  }),
  quantity: z.number().int().positive().optional(),
});

const equipmentBundleSchema = z.object({
  label: z.string().min(1),
  items: z.array(fixedItemSchema).optional(),
  openPicks: z.array(openWeaponPickSchema).optional(),
});

// options: z.array(...).min(1) — strictly stronger than the deleted
// starting-equipment-contract.test.ts's "every choice group has >= 1 option"
// assertion, since it now fails the SEED rather than a separate unit test.
const equipmentChoiceGroupSchema = z.object({
  label: z.string().min(1),
  options: z.array(equipmentBundleSchema).min(1),
});

const startingGoldSchema = z.object({
  diceCount: z.number().int().positive(),
  diceFaces: z.number().int().positive(),
  multiplier: z.number().int().positive(),
});

const classStartingEquipmentSchema = z.object({
  groups: z.array(equipmentChoiceGroupSchema),
  gold: startingGoldSchema,
});

export const startingEquipmentSeedSchema = z.object({
  className: z.string().min(1),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]),
  package: classStartingEquipmentSchema,
});

export interface StartingEquipmentSeed {
  className: string;
  edition: SeedEdition;
  package: ClassStartingEquipment;
}

// PHB'14 p. 72 (armor/weapons), p. 143 (Starting Wealth table). Transcribed
// verbatim from STARTING_EQUIPMENT — see that module's own inline comments
// for the three deliberate catalog shortcuts (Bard's duplicate Lute, Druid's
// "Wooden Shield" -> catalogName "Shield") carried onto their groups below,
// and Warlock's group 4 (items AND openPicks on the same bundle).
const FIGHTER_2014: ClassStartingEquipment = {
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
};

const WIZARD_2014: ClassStartingEquipment = {
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
};

const ROGUE_2014: ClassStartingEquipment = {
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
};

const CLERIC_2014: ClassStartingEquipment = {
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
};

const BARBARIAN_2014: ClassStartingEquipment = {
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
};

const BARD_2014: ClassStartingEquipment = {
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
};

const DRUID_2014: ClassStartingEquipment = {
  gold: { diceCount: 2, diceFaces: 4, multiplier: 10 },
  groups: [
    {
      label: "(a) a wooden shield or (b) any simple weapon",
      options: [
        // Labelled "Wooden Shield" (PHB'14 text) but resolves catalogName
        // "Shield" — the catalog has one Shield row, unqualified by material.
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
};

// Monk is 5d4 x1 — no multiplier, distinct from every other class's x10.
const MONK_2014: ClassStartingEquipment = {
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
};

const PALADIN_2014: ClassStartingEquipment = {
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
};

const RANGER_2014: ClassStartingEquipment = {
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
};

const SORCERER_2014: ClassStartingEquipment = {
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
};

const WARLOCK_2014: ClassStartingEquipment = {
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
      // Auto-granted — leather armor, a simple weapon of choice, and two
      // daggers. This bundle carries BOTH `items` (leather armor, two
      // daggers) AND `openPicks` (any simple weapon) — not "one or the
      // other". Any schema/mapper that assumes a bundle is exclusively one
      // shape is wrong; transcribe as-is.
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
};

const PACKAGES_2014: Record<string, ClassStartingEquipment> = {
  Fighter: FIGHTER_2014,
  Wizard: WIZARD_2014,
  Rogue: ROGUE_2014,
  Cleric: CLERIC_2014,
  Barbarian: BARBARIAN_2014,
  Bard: BARD_2014,
  Druid: DRUID_2014,
  Monk: MONK_2014,
  Paladin: PALADIN_2014,
  Ranger: RANGER_2014,
  Sorcerer: SORCERER_2014,
  Warlock: WARLOCK_2014,
};

// Flattened below into one row per (className, edition) — see this module's
// header for why the 2024 half is an interim verbatim copy.
export const STARTING_EQUIPMENT_PACKAGES: StartingEquipmentSeed[] = Object.entries(PACKAGES_2014).flatMap(
  ([className, pkg]) => [
    { className, edition: "EDITION_2014" as const, package: pkg },
    { className, edition: "EDITION_2024" as const, package: pkg },
  ],
);
