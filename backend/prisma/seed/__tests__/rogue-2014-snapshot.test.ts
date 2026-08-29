// Guard, not red/green: ROGUE_FEATURES' EDITION_2014 rows must stay byte-identical to the pre-#1231 tree, pinned by hand, not re-derived from anything this migration touches.
import { describe, expect, it } from "vitest";

import { ROGUE_FEATURES } from "../rogue-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  {
    subclassSlug: null,
    name: "Expertise",
    level: 1,
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more at level 6.",
  },
  {
    subclassSlug: null,
    name: "Sneak Attack",
    level: 1,
    description:
      "Once per turn, deal extra damage to a target you hit with a finesse or ranged weapon when you have advantage on the attack or an ally is adjacent to the target. 1d6 at L1, +1d6 every odd level (10d6 at L19).",
  },
  {
    subclassSlug: null,
    name: "Thieves' Cant",
    level: 1,
    description:
      "Secret mix of dialect and codewords used by thieves' guilds. Takes 4× as long to convey a message compared to open speech. Also understand signs and symbols used by criminals.",
  },
  {
    subclassSlug: null,
    name: "Cunning Action",
    level: 2,
    description: "As a bonus action, take the Dash, Disengage, or Hide action.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Dodge",
    level: 5,
    description: "When an attacker you can see hits you, use your reaction to halve the attack's damage.",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    subclassSlug: null,
    name: "Reliable Talent",
    level: 11,
    description: "When making an ability check with a skill or tool you're proficient in, treat a d20 roll of 9 or lower as a 10.",
  },
  {
    subclassSlug: null,
    name: "Blindsense",
    level: 14,
    description: "If able to hear, you are aware of the location of any hidden or invisible creature within 10 feet.",
  },
  {
    subclassSlug: null,
    name: "Slippery Mind",
    level: 15,
    description: "You gain proficiency in Wisdom saving throws.",
  },
  {
    subclassSlug: null,
    name: "Elusive",
    level: 18,
    description: "No attack roll has advantage against you while you aren't incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Stroke of Luck",
    level: 20,
    description:
      "If your attack misses a target in range, you can turn the miss into a hit. Or if you fail an ability check, you can treat the d20 roll as a 20. Once used, regain on a short or long rest.",
  },
  {
    subclassSlug: "rogue-arcane-trickster",
    name: "Arcane Trickster Spellcasting",
    level: 3,
    description:
      "You learn spells from the wizard list (primarily enchantment and illusion), casting with Intelligence. Third-caster progression starting at level 3.",
  },
  {
    subclassSlug: "rogue-arcane-trickster",
    name: "Mage Hand Legerdemain",
    level: 3,
    description:
      "You know the Mage Hand cantrip. The hand is invisible and can pick locks, disarm traps, or steal items using your Sleight of Hand skill — even from creatures as long as you distract them.",
  },
  {
    subclassSlug: "rogue-arcane-trickster",
    name: "Magical Ambush",
    level: 9,
    description:
      "If you are hidden when you cast a spell, the target has disadvantage on any saving throw it makes against the spell on the same turn.",
  },
  {
    subclassSlug: "rogue-arcane-trickster",
    name: "Versatile Trickster",
    level: 13,
    description:
      "As a bonus action, direct your Mage Hand to distract a creature within 5 ft of it. Gain advantage on the next attack roll against that creature before the end of your turn.",
  },
  {
    subclassSlug: "rogue-arcane-trickster",
    name: "Spell Thief",
    level: 17,
    description:
      "Immediately after a creature casts a spell that targets you, use your reaction to force it to make a saving throw with its spellcasting ability modifier (DC = your spell save DC). On failure, you negate the spell and steal it — you can cast it (same level) once without a slot within 8 hours. Once used, regain on a long rest.",
  },
  {
    subclassSlug: "rogue-assassin",
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency with the disguise kit and the poisoner's kit.",
  },
  {
    subclassSlug: "rogue-assassin",
    name: "Assassinate",
    level: 3,
    description:
      "You have advantage on attack rolls against any creature that hasn't taken a turn yet this combat. Any hit against a surprised creature is a critical hit.",
  },
  {
    subclassSlug: "rogue-assassin",
    name: "Infiltration Expertise",
    level: 9,
    description:
      "Spend 7 days and 25 gp creating a false identity, including documentation, established acquaintances, and disguises. You can't adopt an identity that belongs to someone else.",
  },
  {
    subclassSlug: "rogue-assassin",
    name: "Impostor",
    level: 13,
    description:
      "After studying a creature for 3 hours, you can mimic its speech, writing, and behavior. A Wisdom (Insight) check contested by your Charisma (Deception) reveals the imposture.",
  },
  {
    subclassSlug: "rogue-assassin",
    name: "Death Strike",
    level: 17,
    description:
      "When you hit a surprised creature, it must make a Constitution save (DC 8 + your Dexterity modifier + proficiency bonus) or take double damage from the attack.",
  },
  {
    subclassSlug: "rogue-thief",
    name: "Fast Hands",
    level: 3,
    description:
      "Use the Cunning Action bonus action to make a Sleight of Hand check, use Thieves' Tools to disarm a trap or open a lock, or take the Use an Object action.",
  },
  {
    subclassSlug: "rogue-thief",
    name: "Second-Story Work",
    level: 3,
    description:
      "Climbing no longer costs extra movement. When you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.",
  },
  {
    subclassSlug: "rogue-thief",
    name: "Supreme Sneak",
    level: 9,
    description: "You have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.",
  },
  {
    subclassSlug: "rogue-thief",
    name: "Use Magic Device",
    level: 13,
    description: "You ignore all class, race, and level requirements on the use of magic items.",
  },
  {
    subclassSlug: "rogue-thief",
    name: "Thief's Reflexes",
    level: 17,
    description:
      "You take two turns during the first round of any combat: your first turn at your normal initiative and your second at your initiative minus 10. You can't use this feature when surprised.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Rogue EDITION_2014 rows are byte-identical to the pre-#1231 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 26 pre-change 2014 features", () => {
    const actual2014 = ROGUE_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(26);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(ROGUE_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 26 pinned above", () => {
    const actualKeys = new Set(ROGUE_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
