// #1226 commit 1: Druid's EDITION_2014 rows must be byte-identical
// transcriptions of what lib/classes/druid.ts's DRUID_FEATURES/
// CIRCLE_OF_THE_LAND_FEATURES/CIRCLE_OF_THE_MOON_FEATURES said BEFORE this
// migration — 2014 is a supported edition, not a rewrite target. This
// snapshot is that pre-change text, pinned by hand from the tree at the
// commit before #1226 landed, NOT re-derived from anything this migration
// touches — a hardcoded oracle is the whole point, mirroring
// barbarian-2014-snapshot.test.ts's/ranger-2014-snapshot.test.ts's shape.
//
// This is a GUARD, not a red/green cycle: it is green on first run by
// construction (DRUID_FEATURES is authored as a byte-identical copy in the
// same commit that adds this file). Its job is to catch commit 2/3 silently
// editing a 2014 row while authoring 2024 content or moving a pool onto a
// row — this file must stay green, unedited, from commit 1 through commit 3.
import { describe, expect, it } from "vitest";

import { DRUID_FEATURES } from "../druid-features.js";

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
    name: "Druidic",
    level: 1,
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Wild Shape",
    level: 2,
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
  },
  {
    subclassSlug: null,
    name: "Timeless Body",
    level: 18,
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    subclassSlug: null,
    name: "Beast Spells",
    level: 18,
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    subclassSlug: null,
    name: "Archdruid",
    level: 20,
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
  // ---- Circle of the Land --------------------------------------------------
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Bonus Cantrip",
    level: 2,
    description: "You learn one additional druid cantrip of your choice.",
  },
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Natural Recovery",
    level: 2,
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Circle Spells",
    level: 3,
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Land's Stride",
    level: 6,
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Nature's Ward",
    level: 10,
    description: "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
  },
  {
    subclassSlug: "druid-circle-of-the-land",
    name: "Nature's Sanctuary",
    level: 14,
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
  // ---- Circle of the Moon ---------------------------------------------------
  {
    subclassSlug: "druid-circle-of-the-moon",
    name: "Combat Wild Shape",
    level: 2,
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    subclassSlug: "druid-circle-of-the-moon",
    name: "Circle Forms",
    level: 2,
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
  },
  {
    subclassSlug: "druid-circle-of-the-moon",
    name: "Primal Strike",
    level: 6,
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    subclassSlug: "druid-circle-of-the-moon",
    name: "Elemental Wild Shape",
    level: 10,
    description: "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    subclassSlug: "druid-circle-of-the-moon",
    name: "Thousand Forms",
    level: 14,
    description: "You can cast the Alter Self spell at will without expending a spell slot.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Druid EDITION_2014 rows are byte-identical to the pre-#1226 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 17 pre-change 2014 features", () => {
    const actual2014 = DRUID_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(17);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(DRUID_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 17 pinned above", () => {
    const actualKeys = new Set(DRUID_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
