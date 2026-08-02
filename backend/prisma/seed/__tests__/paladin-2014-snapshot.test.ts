// #1229 commit 1: Paladin's EDITION_2014 rows must be byte-identical
// transcriptions of what lib/classes/paladin.ts's PALADIN_FEATURES/
// OATH_OF_DEVOTION_FEATURES/OATH_OF_THE_ANCIENTS_FEATURES/
// OATH_OF_VENGEANCE_FEATURES said BEFORE this migration — 2014 is a
// supported edition, not a rewrite target. This snapshot is that pre-change
// text, pinned by hand from the tree at the commit before #1229 landed, NOT
// re-derived from anything this migration touches — a hardcoded oracle is
// the whole point, mirroring cleric-2014-snapshot.test.ts's/
// barbarian-2014-snapshot.test.ts's shape.
//
// This is a GUARD, not a red/green cycle: it is green on first run by
// construction (PALADIN_FEATURES is authored as a byte-identical copy in the
// same commit that adds this file). Its job is to catch commit 2/3 silently
// editing a 2014 row while authoring 2024 content or moving the Channel
// Divinity pool onto a row — this file must stay green, unedited, from
// commit 1 through commit 3.
import { describe, expect, it } from "vitest";

import { PALADIN_FEATURES } from "../paladin-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  // ---- Base class ------------------------------------------------------------
  {
    subclassSlug: null,
    name: "Divine Sense",
    level: 1,
    description:
      "As an action, sense the presence of celestials, fiends, and undead within 60 ft until the end of your next turn (they aren't hidden from this sense). You can also detect consecrated or desecrated places/objects. Uses = 1 + Charisma modifier per long rest.",
  },
  {
    subclassSlug: null,
    name: "Lay on Hands",
    level: 1,
    description:
      "Touch to restore HP from a pool of 5 × your paladin level. Alternatively, spend 5 HP from the pool to cure one disease or neutralize one poison. The pool replenishes on a long rest.",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    description:
      "Choose a fighting style specialty: Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), Great Weapon Fighting (reroll 1s and 2s on damage), or Protection (impose disadvantage on attacks against adjacent allies).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    description:
      "You cast spells using Charisma starting at level 2. Half-caster progression (you gain spell slots more slowly than full casters). You prepare a number of paladin spells equal to your Charisma modifier + half your paladin level (rounded down).",
  },
  {
    subclassSlug: null,
    name: "Divine Smite",
    level: 2,
    description:
      "When you hit with a melee weapon attack, expend one spell slot to deal +2d8 radiant damage (+1d8 per slot level above 1st, max +5d8). Undead and fiends take an additional 1d8 radiant damage.",
  },
  {
    subclassSlug: null,
    name: "Divine Health",
    level: 3,
    description: "The divine magic flowing through you makes you immune to disease.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 3,
    description:
      "You can channel divine energy through your sacred oath to fuel magical effects. You have 1 use, regained on a short or long rest. The specific options depend on your oath (see subclass features).",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Aura of Protection",
    level: 6,
    description:
      "Friendly creatures within 10 ft add your Charisma modifier (minimum +1) to saving throws while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Aura of Courage",
    level: 10,
    description: "Friendly creatures within 10 ft can't be frightened while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Improved Divine Smite",
    level: 11,
    description:
      "Whenever you hit with a melee weapon, you deal an extra 1d8 radiant damage in addition to any other Divine Smite dice.",
  },
  {
    subclassSlug: null,
    name: "Cleansing Touch",
    level: 14,
    description:
      "As an action, end one spell on yourself or one willing creature within reach. Uses = Charisma modifier per long rest (minimum 1).",
  },
  // ---- Oath of Devotion --------------------------------------------------------
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Oath Spells",
    level: 3,
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Sanctuary (L3); Lesser Restoration, Zone of Truth (L5); Beacon of Hope, Dispel Magic (L9); Freedom of Movement, Guardian of Faith (L13); Commune, Flame Strike (L17).",
  },
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Channel Divinity: Sacred Weapon",
    level: 3,
    description:
      "As an action, imbue one weapon with positive energy for 1 minute. It emits bright light (20 ft), dim light (20 ft more), and you add your Charisma modifier to attack rolls. The weapon becomes magical if it isn't already. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Channel Divinity: Turn the Unholy",
    level: 3,
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft must make a Wisdom saving throw or be turned for 1 minute. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Aura of Devotion",
    level: 7,
    description: "Friendly creatures within 10 ft can't be charmed while you are conscious (30 ft at level 18).",
  },
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Purity of Spirit",
    level: 15,
    description: "You are always under the effects of a Protection from Evil and Good spell.",
  },
  {
    subclassSlug: "paladin-oath-of-devotion",
    name: "Holy Nimbus",
    level: 20,
    description:
      "As an action, emit an aura of sunlight for 1 minute (60-ft radius, bright light). At the start of each turn, enemies in the aura take 10 radiant damage. You have advantage on saves against spells cast by fiends and undead during this time. Once used, regain on a long rest.",
  },
  // ---- Oath of the Ancients ----------------------------------------------------
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Oath Spells",
    level: 3,
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (L3); Moonbeam, Misty Step (L5); Plant Growth, Protection from Energy (L9); Ice Storm, Stoneskin (L13); Commune with Nature, Tree Stride (L17).",
  },
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Channel Divinity: Nature's Wrath",
    level: 3,
    description:
      "As an action, restrain a creature within 10 ft: ethereal vines bind it until it makes a Strength or Dexterity save (DC = paladin spell save DC). Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Channel Divinity: Turn the Faithless",
    level: 3,
    description:
      "As an action, present your holy symbol. Each fey or fiend within 30 ft must make a Wisdom saving throw or be turned for 1 minute. A turned creature that has nowhere to flee cowers. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Aura of Warding",
    level: 7,
    description: "You and friendly creatures within 10 ft have resistance to damage from spells (30 ft at level 18).",
  },
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Undying Sentinel",
    level: 15,
    description:
      "When reduced to 0 HP without dying outright, you drop to 1 HP instead. Once used, regain on a long rest. You also don't suffer the aging effects of spells or magical effects.",
  },
  {
    subclassSlug: "paladin-oath-of-the-ancients",
    name: "Elder Champion",
    level: 20,
    description:
      "As an action, take on an aspect of nature for 1 minute: regain 10 HP at the start of each turn; cast spells as a bonus action; enemies within 10 ft have disadvantage on saves against your paladin spells and Channel Divinity. Once used, regain on a long rest.",
  },
  // ---- Oath of Vengeance ---------------------------------------------------------
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Oath Spells",
    level: 3,
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (L3); Hold Person, Misty Step (L5); Haste, Protection from Energy (L9); Banishment, Dimension Door (L13); Hold Monster, Scrying (L17).",
  },
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Channel Divinity: Abjure Enemy",
    level: 3,
    description:
      "As an action, choose a creature within 60 ft. It makes a Wisdom save (DC = paladin spell save DC) or becomes frightened and its speed is 0 until the end of your next turn (half speed on a success). Fiends and undead have disadvantage on this save. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Channel Divinity: Vow of Enmity",
    level: 3,
    description:
      "As a bonus action, say a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Relentless Avenger",
    level: 7,
    description:
      "When you hit with an opportunity attack, you can move up to half your speed (without provoking opportunity attacks) as part of the same reaction.",
  },
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Soul of Vengeance",
    level: 15,
    description: "When a creature under your Vow of Enmity makes an attack, use your reaction to make a melee weapon attack against it.",
  },
  {
    subclassSlug: "paladin-oath-of-vengeance",
    name: "Avenging Angel",
    level: 20,
    description:
      "As an action, assume an angelic form for 1 hour: fly speed 60 ft; enemies within 30 ft who can see you must make a Wisdom save or be frightened of you for 1 minute. Once used, regain on a long rest.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Paladin EDITION_2014 rows are byte-identical to the pre-#1229 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 30 pre-change 2014 features", () => {
    const actual2014 = PALADIN_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(30);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(PALADIN_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 30 pinned above", () => {
    const actualKeys = new Set(PALADIN_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
