// #1233 commit 1: Warlock's EDITION_2014 rows must be byte-identical
// transcriptions of what lib/classes/warlock.ts's WARLOCK_FEATURES/
// THE_FIEND_FEATURES/THE_ARCHFEY_FEATURES/THE_GREAT_OLD_ONE_FEATURES said
// BEFORE this migration — 2014 is a supported edition, not a rewrite target.
// This snapshot is that pre-change text, pinned by hand from the tree at the
// commit before #1233 landed, NOT re-derived from anything this migration
// touches — a hardcoded oracle is the whole point, mirroring
// barbarian-2014-snapshot.test.ts's/fighter-2014-snapshot.test.ts's shape.
//
// This is a GUARD, not a red/green cycle: it is green on first run by
// construction (WARLOCK_FEATURES is authored as a byte-identical copy in the
// same commit that adds this file). Its job is to catch commit 2/3 silently
// editing a 2014 row while authoring 2024 content or moving a pool onto a
// row — this file must stay green, unedited, from commit 1 through commit 3.
import { describe, expect, it } from "vitest";

import { WARLOCK_FEATURES } from "../warlock-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  // ---- Base class --------------------------------------------------------
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
  // ---- The Fiend ----------------------------------------------------------
  {
    subclassSlug: "warlock-the-fiend",
    name: "Expanded Spell List",
    level: 1,
    description:
      "Add fiend spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Burning Hands, Command (1st); Blindness/Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire Shield, Wall of Fire (4th); Flame Strike, Hallow (5th).",
  },
  {
    subclassSlug: "warlock-the-fiend",
    name: "Dark One's Blessing",
    level: 1,
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    subclassSlug: "warlock-the-fiend",
    name: "Dark One's Own Luck",
    level: 6,
    description: "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: "warlock-the-fiend",
    name: "Fiendish Resilience",
    level: 10,
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    subclassSlug: "warlock-the-fiend",
    name: "Hurl Through Hell",
    level: 14,
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
  },
  // ---- The Archfey ---------------------------------------------------------
  {
    subclassSlug: "warlock-the-archfey",
    name: "Expanded Spell List",
    level: 1,
    description:
      "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th).",
  },
  {
    subclassSlug: "warlock-the-archfey",
    name: "Fey Presence",
    level: 1,
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: "warlock-the-archfey",
    name: "Misty Escape",
    level: 6,
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: "warlock-the-archfey",
    name: "Beguiling Defenses",
    level: 10,
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
  },
  {
    subclassSlug: "warlock-the-archfey",
    name: "Dark Delirium",
    level: 14,
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
  },
  // ---- The Great Old One ---------------------------------------------------
  {
    subclassSlug: "warlock-the-great-old-one",
    name: "Expanded Spell List",
    level: 1,
    description:
      "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th).",
  },
  {
    subclassSlug: "warlock-the-great-old-one",
    name: "Awakened Mind",
    level: 1,
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    subclassSlug: "warlock-the-great-old-one",
    name: "Entropic Ward",
    level: 6,
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: "warlock-the-great-old-one",
    name: "Thought Shield",
    level: 10,
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    subclassSlug: "warlock-the-great-old-one",
    name: "Create Thrall",
    level: 14,
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Warlock EDITION_2014 rows are byte-identical to the pre-#1233 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 20 pre-change 2014 features", () => {
    const actual2014 = WARLOCK_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(20);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(WARLOCK_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 20 pinned above", () => {
    const actualKeys = new Set(WARLOCK_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
