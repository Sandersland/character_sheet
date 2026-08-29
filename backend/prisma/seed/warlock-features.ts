// The Archfey and The Great Old One are EDITION_2014-only — their PHB'24 reworks are non-SRD/unverifiable; assertEverySubclassEditionPopulated hard-fails if a 2024 row is missing without this tag, so both Subclass rows are tagged the same way.
// DATA MODULE ONLY: no direct database calls or async write logic may live in this file.
// No contactPatron pool is authored: Mystic Arcanum's uses are already tracked separately as arcanumUsed, not by this ClassFeature machinery.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`warlock-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawWarlockFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  // Omitted -> identical text seeded for both editions.
  edition?: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  conditionImmunities?: string[];
}

function expand(raw: RawWarlockFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Warlock",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    conditionImmunities: raw.conditionImmunities,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// Base class — PHB'14 p.105ff (2014) / SRD 5.2 pp.70-71 (2024).
const WARLOCK_BASE_RAW: RawWarlockFeature[] = [
  {
    subclassSlug: null,
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Unique short-rest progression: all spell slots are the same (high) level and you regain all slots on a short or long rest. Slots scale: 1st at L1; 2nd at L3; 3rd at L5; 4th at L7; 5th at L9.",
  },
  {
    subclassSlug: null,
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 pp.70-71.
    description:
      "You form a pact with a mysterious patron to cast spells, using Charisma. You know two Warlock cantrips (more at levels 4 and 10) and prepare a growing list of Warlock spells, each no higher a level than the Slot Level shown for your level. All your Pact Magic spell slots are the same (high) level, and you regain every expended slot when you finish a Short or Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Invocations",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Learn 2 eldritch invocations — magical studies that grant you permanent abilities or modify your spells (e.g., Agonizing Blast, Armor of Shadows, Devil's Sight). More invocations at levels 5, 7, 9, 12, 15, 18 (max 8 known).",
  },
  {
    subclassSlug: null,
    name: "Eldritch Invocations",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.70.
    description:
      "You gain one Eldritch Invocation of your choice — a permanent magical ability or lesson unlocked by forbidden knowledge, such as Pact of the Tome — meeting any stated prerequisite. You gain additional invocations as you gain levels: 1 at level 1, 3 at level 2, 5 at level 5, 6 at level 7, 7 at level 9, 8 at level 12, 9 at level 15, and 10 at level 18. Whenever you gain a Warlock level, you can replace one invocation you know with a different one you qualify for, unless it's a prerequisite for another invocation you have.",
  },
  {
    subclassSlug: null,
    name: "Magical Cunning",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. New in 2024 — no 2014 counterpart.
    description:
      "You can perform a 1-minute esoteric rite to regain expended Pact Magic spell slots, up to half your maximum (round up). Once you use this feature, you can't do so again until you finish a Long Rest.",
    resourceKey: "magicalCunning",
    resourceLabel: "Magical Cunning",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 2, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Pact Boon",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Your patron grants a boon: Pact of the Chain (familiar with special forms), Pact of the Blade (summon a pact weapon), or Pact of the Tome (Book of Shadows with extra cantrips and rituals).",
  },
  // Pact Boon has no EDITION_2024 row — Pact of the Blade/Chain/Tome become Eldritch Invocation options from level 1 instead.
  {
    subclassSlug: null,
    name: "Contact Patron",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. New in 2024 — no 2014 counterpart.
    description:
      "You always have the Contact Other Plane spell prepared, and you can cast it without expending a spell slot to contact your patron directly — you automatically succeed on the spell's saving throw. Once you cast it this way, you can't do so again until you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Choose one 6th-level spell from the warlock list as a Mystic Arcanum. You can cast it once without expending a spell slot per long rest. Gain a 7th-level arcanum at L13, 8th at L15, 9th at L17.",
  },
  {
    subclassSlug: null,
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2 p.71.
    description:
      "Your patron grants you a magical secret called an arcanum. Choose one level 6 Warlock spell as this arcanum; you can cast it once without expending a spell slot, and must finish a Long Rest before doing so again. You gain another arcanum spell the same way at level 13 (a 7th-level spell), level 15 (8th-level), and level 17 (9th-level). You regain all uses of your Mystic Arcanum when you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. Text only — the feat system itself is deferred.
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once used, you must finish a long rest before you can do so again.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. Rewritten around 2024's Magical Cunning feature (regains all slots via that rite).
    description: "When you use your Magical Cunning feature, you regain all your expended Pact Magic spell slots.",
  },
];

// The Fiend — SRD 5.2 pp.75-76 (2024) / PHB'14 (2014); Expanded Spell List (2014) renames to Fiend Spells (2024).
const FIEND_SLUG = slug("warlock-the-fiend");
const FIEND_RAW: RawWarlockFeature[] = [
  {
    name: "Expanded Spell List",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Fiend" — Expanded Spell List; page number omitted, could not be verified from a licensed source.
    description:
      "Add fiend spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Burning Hands, Command (1st); Blindness/Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire Shield, Wall of Fire (4th); Flame Strike, Hallow (5th).",
  },
  {
    name: "Fiend Spells",
    subclassSlug: FIEND_SLUG,
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 pp.75-76.
    description:
      "The magic of your patron ensures you always have certain spells prepared, which don't count against the number of spells you can prepare with Pact Magic: Burning Hands, Command, Scorching Ray, Suggestion (level 3); Fireball, Stinking Cloud (level 5); Fire Shield, Wall of Fire (level 7); Geas, Insect Plague (level 9).",
  },
  {
    name: "Dark One's Blessing",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    name: "Dark One's Blessing",
    subclassSlug: FIEND_SLUG,
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.76.
    description:
      "When you reduce an enemy to 0 Hit Points, you gain temporary hit points equal to your Charisma modifier + your warlock level (minimum 1). You also gain this benefit when someone else reduces an enemy within 10 feet of you to 0 Hit Points.",
  },
  {
    name: "Dark One's Own Luck",
    subclassSlug: FIEND_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description: "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Dark One's Own Luck",
    subclassSlug: FIEND_SLUG,
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2 p.76.
    description:
      "You can call on your fiendish patron to alter fate in your favor. When you make an ability check or a saving throw, add 1d10 to the roll after seeing it but before its effects occur. You can do this a number of times equal to your Charisma modifier (minimum of once), but no more than once per roll. Regain all expended uses when you finish a Long Rest.",
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 6, total: { abilityMod: "charisma", min: 1 } }],
  },
  {
    name: "Fiendish Resilience",
    subclassSlug: FIEND_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    name: "Fiendish Resilience",
    subclassSlug: FIEND_SLUG,
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2 p.76.
    description:
      "Choose one damage type, other than Force, whenever you finish a Short or Long Rest. You have resistance to that damage type until you choose a different one.",
  },
  {
    name: "Hurl Through Hell",
    subclassSlug: FIEND_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    name: "Hurl Through Hell",
    subclassSlug: FIEND_SLUG,
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2 p.76.
    description:
      "Once per turn when you hit a creature with an attack, you can try to instantly transport it through the Lower Planes. The target must succeed on a Charisma saving throw against your spell save DC or disappear and hurtle through a nightmare landscape, taking 8d10 psychic damage if it isn't a Fiend and gaining the Incapacitated condition until the end of your next turn, when it returns to its space or the nearest unoccupied one. Once used, you can't use it again until you finish a Long Rest unless you expend a Pact Magic spell slot (no action required) to restore it.",
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

// The Archfey / The Great Old One are EDITION_2014-only (see file header) — a 2024 Warlock can only pick The Fiend until PHB'24 content is authored for these two.
const ARCHFEY_SLUG = slug("warlock-the-archfey");
const ARCHFEY_RAW: RawWarlockFeature[] = [
  {
    name: "Expanded Spell List",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Archfey" — Expanded Spell List; page number omitted, could not be verified from a licensed source.
    description:
      "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th).",
  },
  {
    name: "Fey Presence",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "feyPresence",
    resourceLabel: "Fey Presence",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    name: "Misty Escape",
    subclassSlug: ARCHFEY_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
    resourceKey: "mistyEscape",
    resourceLabel: "Misty Escape",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Beguiling Defenses",
    subclassSlug: ARCHFEY_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
    // PHB'14 p.109: flat, unconditional Charmed immunity.
    conditionImmunities: ["charmed"],
  },
  {
    name: "Dark Delirium",
    subclassSlug: ARCHFEY_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
    resourceKey: "darkDelirium",
    resourceLabel: "Dark Delirium",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

const GREAT_OLD_ONE_SLUG = slug("warlock-the-great-old-one");
const GREAT_OLD_ONE_RAW: RawWarlockFeature[] = [
  {
    name: "Expanded Spell List",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Great Old One" — Expanded Spell List; page number omitted, could not be verified from a licensed source.
    description:
      "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th).",
  },
  {
    name: "Awakened Mind",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "entropicWard",
    resourceLabel: "Entropic Ward",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Thought Shield",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

export const WARLOCK_FEATURES: ClassFeatureSeedRow[] = [...WARLOCK_BASE_RAW, ...FIEND_RAW, ...ARCHFEY_RAW, ...GREAT_OLD_ONE_RAW].flatMap(expand);
