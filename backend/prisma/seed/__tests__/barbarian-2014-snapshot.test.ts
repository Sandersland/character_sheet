// This snapshot must stay green and unedited — its job is to catch a later commit silently editing a 2014 row while authoring 2024 content.
import { describe, expect, it } from "vitest";

import { BARBARIAN_FEATURES } from "../barbarian-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  {
    subclassSlug: null,
    name: "Rage",
    level: 1,
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    description: "While not wearing armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You may use a shield.",
  },
  {
    subclassSlug: null,
    name: "Reckless Attack",
    level: 2,
    description:
      "When making your first attack on your turn, you may attack recklessly: you have advantage on melee weapon attack rolls using Strength this turn, but attack rolls against you also have advantage until your next turn.",
  },
  {
    subclassSlug: null,
    name: "Danger Sense",
    level: 2,
    description:
      "You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. Doesn't apply when blinded, deafened, or incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    subclassSlug: null,
    name: "Fast Movement",
    level: 5,
    description: "Your speed increases by 10 feet while you aren't wearing heavy armor.",
  },
  {
    subclassSlug: null,
    name: "Feral Instinct",
    level: 7,
    description:
      "You have advantage on initiative rolls. If surprised at the start of combat, you can still act normally on your first turn if you enter your rage before doing anything else.",
  },
  {
    subclassSlug: null,
    name: "Brutal Critical",
    level: 9,
    description: "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  {
    subclassSlug: null,
    name: "Relentless Rage",
    level: 11,
    description:
      "When reduced to 0 HP while raging without dying outright, make a DC 10 Con save (DC +5 each use; resets on a short or long rest) to drop to 1 HP instead.",
  },
  {
    subclassSlug: null,
    name: "Persistent Rage",
    level: 15,
    description: "Your rage ends early only if you fall unconscious or choose to end it.",
  },
  {
    subclassSlug: null,
    name: "Indomitable Might",
    level: 18,
    description: "If your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
  },
  {
    subclassSlug: null,
    name: "Primal Champion",
    level: 20,
    description: "Your Strength and Constitution scores each increase by 4, and their maximums become 24.",
  },
  {
    subclassSlug: "barbarian-totem-warrior",
    name: "Spirit Seeker",
    level: 3,
    description: "Gain the ability to cast Beast Sense and Speak with Animals as rituals.",
  },
  {
    subclassSlug: "barbarian-totem-warrior",
    name: "Totem Spirit",
    level: 3,
    description:
      "Choose a totem animal and gain a benefit while raging. Bear: resistance to all damage except psychic. Eagle: Disengage/Dash as a bonus action; can't be opportunity attacked except by flying creatures. Wolf: allies have advantage on melee attacks against creatures within 5 ft of you.",
  },
  {
    subclassSlug: "barbarian-totem-warrior",
    name: "Aspect of the Beast",
    level: 6,
    description:
      "Gain a magical benefit from a second totem animal (can be the same or different). Bear: carry twice the weight; advantage on Strength checks. Eagle: see up to 1 mile clearly, dim light as bright. Wolf: hunt with a group; allies can't be tracked when traveling.",
  },
  {
    subclassSlug: "barbarian-totem-warrior",
    name: "Spirit Walker",
    level: 10,
    description: "Cast the Commune with Nature spell as a ritual.",
  },
  {
    subclassSlug: "barbarian-totem-warrior",
    name: "Totemic Attunement",
    level: 14,
    description:
      "Gain a benefit from a third totem animal while raging. Bear: threatening presence — enemies within 5 ft have disadvantage on attacks against non-you targets. Eagle: fly speed equal to walking speed. Wolf: knock prone when you hit with melee attack as a bonus action.",
  },
  {
    subclassSlug: "barbarian-berserker",
    name: "Frenzy",
    level: 3,
    description:
      "When you rage, choose to go into a frenzy. For the rage's duration, make one melee weapon attack as a bonus action on each of your turns. When the rage ends, you suffer one level of exhaustion.",
  },
  {
    subclassSlug: "barbarian-berserker",
    name: "Mindless Rage",
    level: 6,
    description: "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
  },
  {
    subclassSlug: "barbarian-berserker",
    name: "Intimidating Presence",
    level: 10,
    description:
      "As an action, frighten one creature within 30 ft that can see and hear you. It must succeed on a Wisdom save (DC 8 + proficiency + Charisma modifier) or be frightened until the end of your next turn. On a success, the target is immune to this feature for 24 hours.",
  },
  {
    subclassSlug: "barbarian-berserker",
    name: "Retaliation",
    level: 14,
    description: "When you take damage from a creature within 5 ft, use your reaction to make one melee weapon attack against that creature.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Barbarian EDITION_2014 rows are byte-identical to the pre-#1223 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 21 pre-change 2014 features", () => {
    const actual2014 = BARBARIAN_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(21);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(BARBARIAN_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 21 pinned above", () => {
    const actualKeys = new Set(BARBARIAN_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
