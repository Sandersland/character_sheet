// This snapshot must stay green and unedited through commit 3 — its job is to catch a later commit silently editing a 2014 row while authoring 2024 content.
import { describe, expect, it } from "vitest";

import { BARD_FEATURES } from "../bard-features.js";

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
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    subclassSlug: null,
    name: "Song of Rest",
    level: 2,
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  {
    subclassSlug: null,
    name: "Expertise",
    level: 3,
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 6,
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 20,
    description: "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
  {
    subclassSlug: "bard-college-of-lore",
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency in three skills of your choice.",
  },
  {
    subclassSlug: "bard-college-of-lore",
    name: "Cutting Words",
    level: 3,
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    subclassSlug: "bard-college-of-lore",
    name: "Additional Magical Secrets",
    level: 6,
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  {
    subclassSlug: "bard-college-of-lore",
    name: "Peerless Skill",
    level: 14,
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
  {
    subclassSlug: "bard-college-of-valor",
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency with medium armor, shields, and martial weapons.",
  },
  {
    subclassSlug: "bard-college-of-valor",
    name: "Combat Inspiration",
    level: 3,
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    subclassSlug: "bard-college-of-valor",
    name: "Extra Attack",
    level: 6,
    description: "You can attack twice whenever you take the Attack action.",
  },
  {
    subclassSlug: "bard-college-of-valor",
    name: "Battle Magic",
    level: 14,
    description: "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Bard EDITION_2014 rows are byte-identical to the pre-#1224 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 17 pre-change 2014 features", () => {
    const actual2014 = BARD_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(17);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(BARD_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 17 pinned above", () => {
    const actualKeys = new Set(BARD_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });

  // derivedStat/derivedStatTiers on this row must survive the AuthoredFeature-to-literal-row move losslessly.
  it("College of Valor's Extra Attack keeps its derivedStat/derivedStatTiers under EDITION_2014", () => {
    const row = BARD_FEATURES.find(
      (r) => r.edition === "EDITION_2014" && r.subclassSlug === "bard-college-of-valor" && r.name === "Extra Attack",
    );
    expect(row?.derivedStat).toBe("attacksPerAction");
    expect(row?.derivedStatTiers).toEqual([{ minLevel: 6, value: 2 }]);
  });
});
