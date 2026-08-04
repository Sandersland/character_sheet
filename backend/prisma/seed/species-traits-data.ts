// Species trait catalog (#1682, epic #1518, slice 4/8) — pure data, no
// Prisma, no side effects (same split as species-data.ts's SPECIES; the
// executable upsert logic lives in seed-species-traits.ts, mirroring
// species-data.ts/seed-species.ts's own split). DATA MODULE ONLY (#1277 AC 4,
// scripts/check-seed-data-modules.sh).
//
// Scope (issue #1682): the 2014 roster's FULL trait text (SRD 5.1, PHB'14 for
// subrace-only content) and the 2024 roster's NON-LINEAGE traits (SRD 5.2 /
// PHB'24) — 2024 lineage/legacy/ancestry traits beyond Dragonborn's Draconic
// Ancestry (Elf lineages, Gnome lineages, Tiefling legacies, Goliath giant
// ancestry) are #1683's scope, not this slice's. Dragonborn's Draconic
// Ancestry is authored in BOTH editions here (epic review decision 7 — the
// variant rows themselves are seeded in #1679).
//
// Derived vs announce-only (owner ruling 2026-08-03, including darkvision —
// visible information, not a derived combat stat): the ONLY targets the
// existing FeatImprovement vocabulary (srd/feats.ts) can express for a
// species trait are `maxHp` (perLevel), `armorProficiency`, and
// `weaponProficiency` — there is no `resistance`/`advantageOnSave` target, so
// every resistance/advantage/spell/Tool-like trait (Dwarven Resilience,
// Fey Ancestry, Hellish Resistance, Gnome Cunning, …) stays announce-only
// cited text (`improvements` omitted). This is not a content gap — extending
// the vocabulary is out of this slice's scope (not requested by #1682).
//
// Choice-bearing traits: Half-Elf Skill Versatility and High Elf Cantrip carry
// a real `choice` spec as of #1689 (speciesTraitChoiceSchema, lib/srd/
// species-trait-choices.ts). The 2024 trio (Human Skillful/Versatile, Elf Keen
// Senses) carries one too as of #1690 — Skillful/Keen Senses ride the SAME
// chooseSkills spec (Keen Senses restricted via `from`; Skillful unrestricted),
// and Versatile is the first row to use the new chooseOriginFeat spec.
//
// Level-gated traits (2024 Dragonborn's Draconic Flight at level 5, Aasimar's
// Radiant Soul/Necrotic Shroud/Celestial Revelation, Goliath's Large Form) are
// OUT of scope this slice: SpeciesTrait carries no `level` column (unlike
// ClassFeature), so an always-rendered row would misrepresent a level-gated
// trait as available from level 1. Left for a future slice that adds gating.
import { z } from "zod";

import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import { featImprovementSchema } from "../../src/lib/srd/feats.js";
import { speciesTraitChoiceSchema, type SpeciesTraitChoice } from "../../src/lib/srd/species-trait-choices.js";
import type { SeedEdition } from "./edition.js";

export interface SpeciesTraitSeed {
  speciesSlug: string;
  speciesEdition: SeedEdition;
  /** Matches a SpeciesVariantSeed.slug scoped to this species (species-data.ts); omitted for a species-level trait. */
  variantSlug?: string;
  name: string;
  description: string;
  improvements?: FeatImprovement[];
  /** #1689: the player-choice mechanic this trait grants (Half-Elf's two
   *  skills, High Elf's cantrip) — omitted for every fixed-only/announce-only
   *  trait, the vast majority. */
  choice?: SpeciesTraitChoice;
}

// Validated at seed time (prisma/seed/validate.ts). Reuses featImprovementSchema
// (lib/srd/feats.ts) — the SAME zod a taken feat's improvements snapshot and a
// ClassFeature row's improvements column validate against (#1691) — rather
// than a third declaration. `choice` reuses speciesTraitChoiceSchema the same way.
export const speciesTraitSeedSchema = z
  .object({
    speciesSlug: z.string().min(1),
    speciesEdition: z.enum(["EDITION_2014", "EDITION_2024"]),
    variantSlug: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    improvements: z.array(featImprovementSchema).optional(),
    choice: speciesTraitChoiceSchema.optional(),
  })
  .strict();

// --- Small composition helpers (mirrors species-data.ts's dragonAncestryVariants
// — generating repetitive rows in TS is still "content is data": the OUTPUT is
// a flat SpeciesTraitSeed[], these just keep the boilerplate DRY) ------------

function darkvision(speciesSlug: string, edition: SeedEdition, citation: string, range = 60): SpeciesTraitSeed {
  return {
    speciesSlug,
    speciesEdition: edition,
    name: "Darkvision",
    description: `You can see in dim light within ${range} feet of you as if it were bright light, and in darkness as if it were dim light (no color, only shades of gray). (${citation})`,
  };
}

const DRAGON_TYPE_INFO: Record<string, { damageType: string; shape2014: "cone" | "line"; save2014: "Dexterity" | "Constitution" }> = {
  Black: { damageType: "acid", shape2014: "line", save2014: "Dexterity" },
  Blue: { damageType: "lightning", shape2014: "line", save2014: "Dexterity" },
  Brass: { damageType: "fire", shape2014: "line", save2014: "Dexterity" },
  Bronze: { damageType: "lightning", shape2014: "line", save2014: "Dexterity" },
  Copper: { damageType: "acid", shape2014: "line", save2014: "Dexterity" },
  Gold: { damageType: "fire", shape2014: "cone", save2014: "Dexterity" },
  Green: { damageType: "poison", shape2014: "cone", save2014: "Constitution" },
  Red: { damageType: "fire", shape2014: "cone", save2014: "Dexterity" },
  Silver: { damageType: "cold", shape2014: "cone", save2014: "Dexterity" },
  White: { damageType: "cold", shape2014: "cone", save2014: "Constitution" },
};

// SRD 5.1 p. 34: shape/save/damage scaling fork by dragon type; 2d6 at 1st,
// 3d6 at 6th, 4d6 at 11th, 5d6 at 16th, once per short or long rest.
function draconicAncestryTrait2014(type: string): SpeciesTraitSeed {
  const info = DRAGON_TYPE_INFO[type];
  const shapeText = info.shape2014 === "line" ? "a 5-foot-wide, 30-foot-long line" : "a 15-foot cone";
  return {
    speciesSlug: "dragonborn",
    speciesEdition: "EDITION_2014",
    variantSlug: type.toLowerCase(),
    name: `Draconic Ancestry: ${type}`,
    description:
      `Your draconic ancestry is ${type}, which determines the damage type for your breath weapon and damage resistance: ${info.damageType}. ` +
      `Breath Weapon: as an action, you exhale destructive energy in ${shapeText}. Each creature in the area makes a ${info.save2014} saving throw ` +
      `(DC = 8 + your Constitution modifier + your proficiency bonus), taking 2d6 ${info.damageType} damage on a failure (half as much on a success), ` +
      `increasing to 3d6 at 6th level, 4d6 at 11th, and 5d6 at 16th. Once used, you can't use it again until you finish a short or long rest. ` +
      `Damage Resistance: you have resistance to ${info.damageType} damage. (SRD 5.1 p. 34)`,
  };
}

// PHB'24 p. 25: single shared shape choice (cone OR line) and a Dexterity
// save for every dragon type — the 2014 per-type shape/save fork is gone;
// damage type per ancestry is unchanged from 2014. Usable proficiency-bonus
// times per long rest (not "once per rest" like 2014); scales 1d10 -> 4d10.
function draconicAncestryTrait2024(type: string): SpeciesTraitSeed {
  const info = DRAGON_TYPE_INFO[type];
  return {
    speciesSlug: "dragonborn",
    speciesEdition: "EDITION_2024",
    variantSlug: type.toLowerCase(),
    name: `Draconic Ancestry: ${type}`,
    description:
      `Your draconic ancestry is ${type}, which determines the damage type for your Breath Weapon and Damage Resistance: ${info.damageType}. ` +
      `Breath Weapon: when you take the Attack action, you can replace one of your attacks with an exhalation in a 15-foot cone or a 5-foot-wide, ` +
      `30-foot-long line (your choice each time). Each creature in the area makes a Dexterity saving throw (DC = 8 + your Constitution modifier + ` +
      `your proficiency bonus), taking 1d10 ${info.damageType} damage on a failure (half as much on a success), increasing to 2d10 at level 5, ` +
      `3d10 at level 11, and 4d10 at level 17. Usable a number of times equal to your proficiency bonus, regaining all uses on a long rest. ` +
      `Damage Resistance: you have resistance to ${info.damageType} damage. (PHB'24 p. 25)`,
  };
}

const DRAGON_TYPES = Object.keys(DRAGON_TYPE_INFO);

// --- 2014 (SRD 5.1 / PHB'14) --------------------------------------------------

const DWARF_2014: SpeciesTraitSeed[] = [
  darkvision("dwarf", "EDITION_2014", "SRD 5.1 p. 18", 60),
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2014",
    name: "Dwarven Resilience",
    description: "You have advantage on saving throws against poison, and you have resistance against poison damage. (SRD 5.1 p. 18)",
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2014",
    name: "Dwarven Combat Training",
    description: "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer. (SRD 5.1 p. 18)",
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Battleaxes" },
      { target: "weaponProficiency", amount: 1, key: "Handaxes" },
      { target: "weaponProficiency", amount: 1, key: "Light Hammers" },
      { target: "weaponProficiency", amount: 1, key: "Warhammers" },
    ],
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2014",
    name: "Stonecunning",
    description:
      "Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus. (SRD 5.1 p. 18)",
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2014",
    variantSlug: "hill",
    name: "Dwarven Toughness",
    description: "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level. (SRD 5.1 p. 20)",
    improvements: [{ target: "maxHp", amount: 1, perLevel: true }],
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2014",
    variantSlug: "mountain",
    name: "Dwarven Armor Training",
    description: "You have proficiency with light and medium armor. (SRD 5.1 p. 20)",
    improvements: [
      { target: "armorProficiency", amount: 1, key: "light" },
      { target: "armorProficiency", amount: 1, key: "medium" },
    ],
  },
];

const ELF_WEAPON_TRAINING_2014: FeatImprovement[] = [
  { target: "weaponProficiency", amount: 1, key: "Longswords" },
  { target: "weaponProficiency", amount: 1, key: "Shortswords" },
  { target: "weaponProficiency", amount: 1, key: "Shortbows" },
  { target: "weaponProficiency", amount: 1, key: "Longbows" },
];

const ELF_2014: SpeciesTraitSeed[] = [
  darkvision("elf", "EDITION_2014", "SRD 5.1 p. 21", 60),
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    name: "Fey Ancestry",
    description: "You have advantage on saving throws against being charmed, and magic can't put you to sleep. (SRD 5.1 p. 21)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    name: "Trance",
    description:
      "Elves don't need to sleep. Instead, you meditate deeply, remaining semiconscious, for 4 hours a day (the elven word for this is 'trance'). (SRD 5.1 p. 21)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "high",
    name: "Elf Weapon Training",
    description: "You have proficiency with the longsword, shortsword, shortbow, and longbow. (SRD 5.1 p. 24)",
    improvements: ELF_WEAPON_TRAINING_2014,
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "high",
    name: "Cantrip",
    description: "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it. (SRD 5.1 p. 24)",
    choice: { chooseCantrip: { list: "wizard", castingAbility: "intelligence" } },
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "wood",
    name: "Elf Weapon Training",
    description: "You have proficiency with the longsword, shortsword, shortbow, and longbow. (SRD 5.1 p. 24)",
    improvements: ELF_WEAPON_TRAINING_2014,
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "wood",
    name: "Mask of the Wild",
    description: "You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena. (SRD 5.1 p. 24)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "drow",
    name: "Superior Darkvision",
    description: "Your darkvision has a radius of 120 feet, superseding the base Elf trait's 60 feet. (SRD 5.1 p. 24)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "drow",
    name: "Sunlight Sensitivity",
    description:
      "You have disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight when you, the target of your attack, or whatever you are trying to perceive is in direct sunlight. (SRD 5.1 p. 24)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "drow",
    name: "Drow Magic",
    description:
      "You know the dancing lights cantrip. When you reach 3rd level, you can cast faerie fire once per long rest; at 5th level, darkness once per long rest. Charisma is your spellcasting ability for these spells. (SRD 5.1 p. 24) — no SpeciesGrantedSpell rows this slice (#1683's scope).",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2014",
    variantSlug: "drow",
    name: "Drow Weapon Training",
    description: "You have proficiency with rapiers, shortswords, and hand crossbows. (SRD 5.1 p. 24)",
    improvements: [
      { target: "weaponProficiency", amount: 1, key: "Rapiers" },
      { target: "weaponProficiency", amount: 1, key: "Shortswords" },
      { target: "weaponProficiency", amount: 1, key: "Hand Crossbows" },
    ],
  },
];

const HALFLING_2014: SpeciesTraitSeed[] = [
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2014",
    name: "Lucky",
    description: "When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll. (SRD 5.1 p. 27)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2014",
    name: "Brave",
    description: "You have advantage on saving throws against being frightened. (SRD 5.1 p. 27)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2014",
    name: "Halfling Nimbleness",
    description: "You can move through the space of any creature that is of a size larger than yours. (SRD 5.1 p. 27)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2014",
    variantSlug: "lightfoot",
    name: "Naturally Stealthy",
    description: "You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you. (SRD 5.1 p. 28)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2014",
    variantSlug: "stout",
    name: "Stout Resilience",
    description: "You have advantage on saving throws against poison, and you have resistance against poison damage. (SRD 5.1 p. 28)",
  },
];

const DRAGONBORN_2014_BASE: SpeciesTraitSeed[] = [
  ...DRAGON_TYPES.map(draconicAncestryTrait2014),
];

const GNOME_2014: SpeciesTraitSeed[] = [
  darkvision("gnome", "EDITION_2014", "SRD 5.1 p. 23", 60),
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2014",
    name: "Gnome Cunning",
    description: "You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic. (SRD 5.1 p. 23)",
  },
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2014",
    variantSlug: "forest",
    name: "Natural Illusionist",
    description: "You know the minor illusion cantrip. Intelligence is your spellcasting ability for it. (SRD 5.1 p. 23) — no SpeciesGrantedSpell row this slice.",
  },
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2014",
    variantSlug: "forest",
    name: "Speak with Small Beasts",
    description: "Through sounds and gestures, you can communicate simple ideas with Small or smaller beasts. (SRD 5.1 p. 23)",
  },
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2014",
    variantSlug: "rock",
    name: "Artificer's Lore",
    description:
      "Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus, instead of any proficiency bonus you normally apply. (SRD 5.1 p. 23)",
  },
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2014",
    variantSlug: "rock",
    name: "Tinker",
    description:
      "You have proficiency with artisan's tools (tinker's tools) and can construct a tiny clockwork device (a clockwork toy, fire starter, or music box). (SRD 5.1 p. 23) — tool proficiency granted via character-create.ts's race.toolProficiencies path, not this vocabulary.",
  },
];

const HALF_ELF_2014: SpeciesTraitSeed[] = [
  darkvision("half-elf", "EDITION_2014", "SRD 5.1 p. 25", 60),
  {
    speciesSlug: "half-elf",
    speciesEdition: "EDITION_2014",
    name: "Fey Ancestry",
    description: "You have advantage on saving throws against being charmed, and magic can't put you to sleep. (SRD 5.1 p. 25)",
  },
  {
    speciesSlug: "half-elf",
    speciesEdition: "EDITION_2014",
    name: "Skill Versatility",
    description: "You gain proficiency in two skills of your choice. (SRD 5.1 p. 25)",
    choice: { chooseSkills: { count: 2 } },
  },
];

const HALF_ORC_2014: SpeciesTraitSeed[] = [
  darkvision("half-orc", "EDITION_2014", "SRD 5.1 p. 26", 60),
  {
    speciesSlug: "half-orc",
    speciesEdition: "EDITION_2014",
    name: "Menacing",
    description: "You gain proficiency in the Intimidation skill. (SRD 5.1 p. 26)",
  },
  {
    speciesSlug: "half-orc",
    speciesEdition: "EDITION_2014",
    name: "Relentless Endurance",
    description: "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, you can't use it again until you finish a long rest. (SRD 5.1 p. 26)",
  },
  {
    speciesSlug: "half-orc",
    speciesEdition: "EDITION_2014",
    name: "Savage Attacks",
    description: "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit. (SRD 5.1 p. 26)",
  },
];

const TIEFLING_2014: SpeciesTraitSeed[] = [
  darkvision("tiefling", "EDITION_2014", "SRD 5.1 p. 29", 60),
  {
    speciesSlug: "tiefling",
    speciesEdition: "EDITION_2014",
    name: "Hellish Resistance",
    description: "You have resistance to fire damage. (SRD 5.1 p. 29)",
  },
  {
    speciesSlug: "tiefling",
    speciesEdition: "EDITION_2014",
    name: "Infernal Legacy",
    description:
      "You know the thaumaturgy cantrip. At 3rd level, you can cast hellish rebuke once per long rest; at 5th level, darkness once per long rest. Charisma is your spellcasting ability for these spells. (SRD 5.1 p. 29) — no SpeciesGrantedSpell rows this slice.",
  },
];

const SPECIES_TRAITS_2014: SpeciesTraitSeed[] = [
  ...DWARF_2014,
  ...ELF_2014,
  ...HALFLING_2014,
  ...DRAGONBORN_2014_BASE,
  ...GNOME_2014,
  ...HALF_ELF_2014,
  ...HALF_ORC_2014,
  ...TIEFLING_2014,
  // Human (SRD 5.1 p. 31): no traits beyond the ability score increase — no rows.
];

// --- 2024 (SRD 5.2 / PHB'24), non-lineage traits only -------------------------
// Elf/Gnome/Tiefling lineage-legacy variants and Goliath's giant ancestry are
// #1683's scope; only their species-level (non-lineage) traits land here.

const AASIMAR_2024: SpeciesTraitSeed[] = [
  darkvision("aasimar", "EDITION_2024", "SRD 5.2 p. 12", 60),
  {
    speciesSlug: "aasimar",
    speciesEdition: "EDITION_2024",
    name: "Celestial Resistance",
    description: "You have resistance to necrotic damage and radiant damage. (SRD 5.2 p. 12)",
  },
  {
    speciesSlug: "aasimar",
    speciesEdition: "EDITION_2024",
    name: "Healing Hands",
    description:
      "As a Magic action, you touch a creature and roll a number of d4s equal to your proficiency bonus; the creature regains a number of Hit Points equal to the roll's total. Once used, you can't use this trait again until you finish a long rest. (SRD 5.2 p. 12)",
  },
  {
    speciesSlug: "aasimar",
    speciesEdition: "EDITION_2024",
    name: "Light Bearer",
    description: "You know the Light cantrip. Charisma is your spellcasting ability for it. (SRD 5.2 p. 12) — no SpeciesGrantedSpell row this slice.",
  },
];

const DRAGONBORN_2024_BASE: SpeciesTraitSeed[] = [
  {
    speciesSlug: "dragonborn",
    speciesEdition: "EDITION_2024",
    name: "Draconic Ancestry",
    description: "You have a draconic ancestor, chosen from the Draconic Ancestry table, which determines your Breath Weapon and Damage Resistance's damage type. (PHB'24 p. 25)",
  },
  ...DRAGON_TYPES.map(draconicAncestryTrait2024),
];

const DWARF_2024: SpeciesTraitSeed[] = [
  darkvision("dwarf", "EDITION_2024", "SRD 5.2 p. 22", 120),
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2024",
    name: "Dwarven Resilience",
    description: "You have resistance to poison damage, and you have advantage on saving throws you make to avoid or end the poisoned condition. (SRD 5.2 p. 22)",
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2024",
    name: "Dwarven Toughness",
    description: "Your hit point maximum increases by 1, and it increases by 1 again whenever you gain a level. (SRD 5.2 p. 22)",
    improvements: [{ target: "maxHp", amount: 1, perLevel: true }],
  },
  {
    speciesSlug: "dwarf",
    speciesEdition: "EDITION_2024",
    name: "Stonecunning",
    description:
      "As a bonus action, you gain tremorsense with a range of 60 feet for 10 minutes; you must be on a stone surface or touching stone to use it. Usable a number of times equal to your proficiency bonus, regaining all uses on a long rest. (SRD 5.2 p. 22)",
  },
];

const ELF_2024_BASE: SpeciesTraitSeed[] = [
  darkvision("elf", "EDITION_2024", "SRD 5.2 p. 24", 60),
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2024",
    name: "Fey Ancestry",
    description: "You have advantage on saving throws you make to avoid or end the charmed condition. (SRD 5.2 p. 24)",
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2024",
    name: "Keen Senses",
    description: "You have proficiency in one of the following skills of your choice: Insight, Perception, or Survival. (SRD 5.2 p. 24)",
    choice: { chooseSkills: { count: 1, from: ["insight", "perception", "survival"] } },
  },
  {
    speciesSlug: "elf",
    speciesEdition: "EDITION_2024",
    name: "Trance",
    description: "You don't need to sleep, and magic can't put you to sleep. You can finish a long rest in 4 hours if you spend those hours in a trancelike meditation. (SRD 5.2 p. 24)",
  },
];

const GNOME_2024_BASE: SpeciesTraitSeed[] = [
  darkvision("gnome", "EDITION_2024", "SRD 5.2 p. 30", 60),
  {
    speciesSlug: "gnome",
    speciesEdition: "EDITION_2024",
    name: "Gnomish Cunning",
    description: "You have advantage on Intelligence, Wisdom, and Charisma saving throws against magic. (SRD 5.2 p. 30)",
  },
];

const GOLIATH_2024_BASE: SpeciesTraitSeed[] = [
  {
    speciesSlug: "goliath",
    speciesEdition: "EDITION_2024",
    name: "Giant Ancestry",
    description: "You have a magical trait inherited from your giant ancestors, chosen from the Giant Ancestry table. (SRD 5.2 p. 32) — the ancestry choice's mechanics are #1683's scope.",
  },
  {
    speciesSlug: "goliath",
    speciesEdition: "EDITION_2024",
    name: "Powerful Build",
    description: "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift. (SRD 5.2 p. 32)",
  },
];

const HALFLING_2024_BASE: SpeciesTraitSeed[] = [
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2024",
    name: "Brave",
    description: "You have advantage on saving throws you make to avoid or end the frightened condition. (SRD 5.2 p. 34)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2024",
    name: "Halfling Nimbleness",
    description: "You can move through the space of any creature that is a size larger than you. (SRD 5.2 p. 34)",
  },
  {
    speciesSlug: "halfling",
    speciesEdition: "EDITION_2024",
    name: "Luck",
    description: "When you roll a 1 on the d20 of a d20 Test, you can reroll the die, and you must use the new roll. (SRD 5.2 p. 34)",
  },
];

const HUMAN_2024_BASE: SpeciesTraitSeed[] = [
  {
    speciesSlug: "human",
    speciesEdition: "EDITION_2024",
    name: "Resourceful",
    description: "You gain Heroic Inspiration whenever you finish a long rest. (SRD 5.2 p. 36)",
  },
  {
    speciesSlug: "human",
    speciesEdition: "EDITION_2024",
    name: "Skillful",
    description: "You gain proficiency in one skill of your choice. (SRD 5.2 p. 36)",
    choice: { chooseSkills: { count: 1 } },
  },
  {
    speciesSlug: "human",
    speciesEdition: "EDITION_2024",
    name: "Versatile",
    description: "You gain an Origin feat of your choice. (SRD 5.2 p. 36)",
    choice: { chooseOriginFeat: true },
  },
];

const ORC_2024_BASE: SpeciesTraitSeed[] = [
  darkvision("orc", "EDITION_2024", "SRD 5.2 p. 40", 120),
  {
    speciesSlug: "orc",
    speciesEdition: "EDITION_2024",
    name: "Adrenaline Rush",
    description:
      "You can take the Dash action as a bonus action, and when you do so, you gain a number of temporary hit points equal to your proficiency bonus. Usable a number of times equal to your proficiency bonus, regaining all uses on a long rest. (SRD 5.2 p. 40)",
  },
  {
    speciesSlug: "orc",
    speciesEdition: "EDITION_2024",
    name: "Relentless Endurance",
    description: "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, you can't use it again until you finish a long rest. (SRD 5.2 p. 40)",
  },
];

const TIEFLING_2024_BASE: SpeciesTraitSeed[] = [
  darkvision("tiefling", "EDITION_2024", "SRD 5.2 p. 47", 60),
  {
    speciesSlug: "tiefling",
    speciesEdition: "EDITION_2024",
    name: "Fiendish Legacy",
    description: "You choose a legacy — Abyssal, Chthonic, or Infernal — which grants resistances and spells. (SRD 5.2 p. 47) — the legacy choice's mechanics are #1683's scope.",
  },
  {
    speciesSlug: "tiefling",
    speciesEdition: "EDITION_2024",
    name: "Otherworldly Presence",
    description: "You know the Thaumaturgy cantrip. Charisma is your spellcasting ability for it. (SRD 5.2 p. 47) — no SpeciesGrantedSpell row this slice.",
  },
];

const SPECIES_TRAITS_2024: SpeciesTraitSeed[] = [
  ...AASIMAR_2024,
  ...DRAGONBORN_2024_BASE,
  ...DWARF_2024,
  ...ELF_2024_BASE,
  ...GNOME_2024_BASE,
  ...GOLIATH_2024_BASE,
  ...HALFLING_2024_BASE,
  ...HUMAN_2024_BASE,
  ...ORC_2024_BASE,
  ...TIEFLING_2024_BASE,
];

export const SPECIES_TRAITS: SpeciesTraitSeed[] = [...SPECIES_TRAITS_2014, ...SPECIES_TRAITS_2024];
