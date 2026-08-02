// #1225 commit 1: Cleric's EDITION_2014 rows must be byte-identical
// transcriptions of what lib/classes/cleric.ts's CLERIC_FEATURES/
// LIFE_DOMAIN_FEATURES/TRICKERY_DOMAIN_FEATURES said BEFORE this migration —
// 2014 is a supported edition, not a rewrite target. This snapshot is that
// pre-change text, pinned by hand from the tree at the commit before #1225
// landed, NOT re-derived from anything this migration touches — a hardcoded
// oracle is the whole point, mirroring warlock-2014-snapshot.test.ts's/
// barbarian-2014-snapshot.test.ts's shape.
//
// This is a GUARD, not a red/green cycle: it is green on first run by
// construction (CLERIC_FEATURES is authored as a byte-identical copy in the
// same commit that adds this file). Its job is to catch commit 2/3 silently
// editing a 2014 row while authoring 2024 content or moving the Channel
// Divinity pool onto a row — this file must stay green, unedited, from
// commit 1 through commit 3.
import { describe, expect, it } from "vitest";

import { CLERIC_FEATURES } from "../cleric-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  // ---- Base class ----------------------------------------------------------
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Turn Undead",
    level: 2,
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
  },
  {
    subclassSlug: null,
    name: "Destroy Undead",
    level: 5,
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention",
    level: 10,
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention Improvement",
    level: 20,
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
  // ---- Life Domain -----------------------------------------------------------
  {
    subclassSlug: "cleric-life-domain",
    name: "Domain Spells",
    level: 1,
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L1); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Bonus Proficiency",
    level: 1,
    description: "You gain proficiency with heavy armor.",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Disciple of Life",
    level: 1,
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Channel Divinity: Preserve Life",
    level: 2,
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Blessed Healer",
    level: 6,
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Divine Strike",
    level: 8,
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  {
    subclassSlug: "cleric-life-domain",
    name: "Supreme Healing",
    level: 17,
    description: "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
  // ---- Trickery Domain -------------------------------------------------------
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Domain Spells",
    level: 1,
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L1); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Blessing of the Trickster",
    level: 1,
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    description: "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Divine Strike",
    level: 8,
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  {
    subclassSlug: "cleric-trickery-domain",
    name: "Improved Duplicity",
    level: 17,
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Cleric EDITION_2014 rows are byte-identical to the pre-#1225 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 18 pre-change 2014 features", () => {
    const actual2014 = CLERIC_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(18);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(CLERIC_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 18 pinned above", () => {
    const actualKeys = new Set(CLERIC_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
