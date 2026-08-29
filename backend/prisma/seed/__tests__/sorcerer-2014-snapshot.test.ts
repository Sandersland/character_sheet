import { describe, expect, it } from "vitest";

import { SORCERER_FEATURES } from "../sorcerer-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Origin",
    level: 1,
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Creating slots costs 2 SP (1st), 3 SP (2nd), 5 SP (3rd), 6 SP (4th), or 7 SP (5th). You can also expend a spell slot to gain SP equal to its level. Regain all SP on a long rest.",
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 3,
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 20,
    description: "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
  {
    subclassSlug: "sorcerer-draconic-bloodline",
    name: "Dragon Ancestor",
    level: 1,
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  {
    subclassSlug: "sorcerer-draconic-bloodline",
    name: "Draconic Resilience",
    level: 1,
    description: "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    subclassSlug: "sorcerer-draconic-bloodline",
    name: "Elemental Affinity",
    level: 6,
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    subclassSlug: "sorcerer-draconic-bloodline",
    name: "Dragon Wings",
    level: 14,
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    subclassSlug: "sorcerer-draconic-bloodline",
    name: "Draconic Presence",
    level: 18,
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
  {
    subclassSlug: "sorcerer-wild-magic",
    name: "Wild Magic Surge",
    level: 1,
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    subclassSlug: "sorcerer-wild-magic",
    name: "Tides of Chaos",
    level: 1,
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
  },
  {
    subclassSlug: "sorcerer-wild-magic",
    name: "Bend Luck",
    level: 6,
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    subclassSlug: "sorcerer-wild-magic",
    name: "Controlled Chaos",
    level: 14,
    description: "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    subclassSlug: "sorcerer-wild-magic",
    name: "Spell Bombardment",
    level: 18,
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Sorcerer EDITION_2014 rows are byte-identical to the pre-#1232 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 15 pre-change 2014 features", () => {
    const actual2014 = SORCERER_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(15);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(SORCERER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 15 pinned above", () => {
    const actualKeys = new Set(SORCERER_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
