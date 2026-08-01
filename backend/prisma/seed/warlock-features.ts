// --- Warlock ClassFeature rows, authored as LITERAL data (#1233) ------------
// Commit 1 of 3 (mirrors Fighter's pilot, #1227/#1528/#1532, and Barbarian's
// #1223) moves these rows off lib/classes/warlock.ts's AuthoredFeature[]
// arrays into literal seed data, byte-identical to the old TS-derived text
// (pinned by warlock-2014-snapshot.test.ts). Commit 2 will author Warlock's
// REAL SRD 5.2 (2024) content for the base class and The Fiend, transcribed
// directly from the official SRD 5.2 CC-BY PDF (never a wiki — three
// secondary transcriptions of the invocation-count table disagree with each
// other and with the PDF) — and tag The Archfey/The Great Old One
// EDITION_2014-only, since their PHB'24 reworks are non-SRD and unverifiable.
// Commit 3 will move every movable resource pool onto its row and shrink
// lib/classes/warlock.ts to its irreducible residue — see that file's own
// header for why it survives (it is NOT deletable, unlike fighter.ts/
// barbarian.ts).
// class-features.ts concatenates WARLOCK_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts/barbarian-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text — every
// row below except the three pre-forked "Expanded Spell List" names is
// untagged at this commit (2024 is still an unverified copy of 2014's text,
// #1522 decision: "authored once, populated nowhere"). `edition` set ->
// exactly the one row named. Every EDITION_2014 row below is byte-identical
// to what this same commit pins in warlock-2014-snapshot.test.ts — commit 2
// is what turns the untagged 2024 copies into real SRD 5.2 content.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's/
// barbarian-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`warlock-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawWarlockFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
}

function expand(raw: RawWarlockFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Warlock",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class -------------------------------------------------------------
// 5 rows, untagged (byte-identical text seeded for both editions — 2024 is
// still an unverified copy at this commit).
const WARLOCK_BASE_RAW: RawWarlockFeature[] = [
  {
    subclassSlug: null,
    name: "Pact Magic",
    level: 1,
    description:
      "You cast spells using Charisma. Unique short-rest progression: all spell slots are the same (high) level and you regain all slots on a short or long rest. Slots scale: 1st at L1; 2nd at L3; 3rd at L5; 4th at L7; 5th at L9.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Invocations",
    level: 2,
    description:
      "Learn 2 eldritch invocations — magical studies that grant you permanent abilities or modify your spells (e.g., Agonizing Blast, Armor of Shadows, Devil's Sight). More invocations at levels 5, 7, 9, 12, 15, 18 (max 8 known).",
  },
  {
    subclassSlug: null,
    name: "Pact Boon",
    level: 3,
    description:
      "Your patron grants a boon: Pact of the Chain (familiar with special forms), Pact of the Blade (summon a pact weapon), or Pact of the Tome (Book of Shadows with extra cantrips and rituals).",
  },
  {
    subclassSlug: null,
    name: "Mystic Arcanum",
    level: 11,
    description:
      "Choose one 6th-level spell from the warlock list as a Mystic Arcanum. You can cast it once without expending a spell slot per long rest. Gain a 7th-level arcanum at L13, 8th at L15, 9th at L17.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Master",
    level: 20,
    description:
      "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once used, you must finish a long rest before you can do so again.",
  },
];

// ---- The Fiend ---------------------------------------------------------------
// 5 rows: Expanded Spell List is already forked (#1374 — see below); the
// other 4 stay untagged at this commit.
const FIEND_SLUG = slug("warlock-the-fiend");
const FIEND_RAW: RawWarlockFeature[] = [
  // #1374: PHB'14 grants the Expanded Spell List at warlock level 1, keyed by
  // SPELL level (not character level) — genuinely different text from the
  // 2024 row below (which labels tiers by 2024 character level, #1128), so
  // it forks into one row per edition sharing the "Expanded Spell List" name.
  {
    name: "Expanded Spell List",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2024",
    description:
      "Add fiend spells to your warlock list: Burning Hands, Command (L3); Blindness/Deafness, Scorching Ray (L3); Fireball, Stinking Cloud (L5); Fire Shield, Wall of Fire (L7); Flame Strike, Hallow (L9).",
  },
  {
    name: "Expanded Spell List",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Fiend" — Expanded Spell List. Page number deliberately
    // omitted — could not be verified from a licensed source (see PR).
    description:
      "Add fiend spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Burning Hands, Command (1st); Blindness/Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire Shield, Wall of Fire (4th); Flame Strike, Hallow (5th).",
  },
  {
    name: "Dark One's Blessing",
    subclassSlug: FIEND_SLUG,
    level: 1,
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    name: "Dark One's Own Luck",
    subclassSlug: FIEND_SLUG,
    level: 6,
    description: "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
  },
  {
    name: "Fiendish Resilience",
    subclassSlug: FIEND_SLUG,
    level: 10,
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    name: "Hurl Through Hell",
    subclassSlug: FIEND_SLUG,
    level: 14,
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
  },
];

// ---- The Archfey --------------------------------------------------------------
const ARCHFEY_SLUG = slug("warlock-the-archfey");
const ARCHFEY_RAW: RawWarlockFeature[] = [
  // #1374: same PHB'14-vs-PHB'24 spell-level-vs-character-level fork as The
  // Fiend above.
  {
    name: "Expanded Spell List",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2024",
    description:
      "Add archfey spells to your warlock list: Faerie Fire, Sleep (L3); Calm Emotions, Phantasmal Force (L3); Blink, Plant Growth (L5); Dominate Beast, Greater Invisibility (L7); Dominate Person, Seeming (L9).",
  },
  {
    name: "Expanded Spell List",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Archfey" — Expanded Spell List. Page number deliberately
    // omitted — could not be verified from a licensed source (see PR).
    description:
      "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th).",
  },
  {
    name: "Fey Presence",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Misty Escape",
    subclassSlug: ARCHFEY_SLUG,
    level: 6,
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
  },
  {
    name: "Beguiling Defenses",
    subclassSlug: ARCHFEY_SLUG,
    level: 10,
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
  },
  {
    name: "Dark Delirium",
    subclassSlug: ARCHFEY_SLUG,
    level: 14,
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
  },
];

// ---- The Great Old One ---------------------------------------------------------
const GREAT_OLD_ONE_SLUG = slug("warlock-the-great-old-one");
const GREAT_OLD_ONE_RAW: RawWarlockFeature[] = [
  // #1374: same PHB'14-vs-PHB'24 spell-level-vs-character-level fork as The
  // Fiend/Archfey above.
  {
    name: "Expanded Spell List",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2024",
    description:
      "Add Great Old One spells to your warlock list: Dissonant Whispers, Hideous Laughter (L3); Detect Thoughts, Phantasmal Force (L3); Clairvoyance, Sending (L5); Dominate Beast, Black Tentacles (L7); Dominate Person, Telekinesis (L9).",
  },
  {
    name: "Expanded Spell List",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Great Old One" — Expanded Spell List. Page number
    // deliberately omitted — could not be verified from a licensed source
    // (see PR).
    description:
      "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th).",
  },
  {
    name: "Awakened Mind",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 6,
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    name: "Thought Shield",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 10,
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 14,
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

export const WARLOCK_FEATURES: ClassFeatureSeedRow[] = [...WARLOCK_BASE_RAW, ...FIEND_RAW, ...ARCHFEY_RAW, ...GREAT_OLD_ONE_RAW].flatMap(expand);
