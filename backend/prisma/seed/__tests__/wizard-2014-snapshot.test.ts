// #1234: Wizard's EDITION_2014 rows must be byte-identical transcriptions of
// what lib/classes/wizard.ts's WIZARD_FEATURES/SCHOOL_OF_EVOCATION_FEATURES/
// SCHOOL_OF_ABJURATION_FEATURES/SCHOOL_OF_ILLUSION_FEATURES said BEFORE this
// migration — 2014 is a supported edition, not a rewrite target. This
// snapshot is that pre-change text, pinned by hand from the tree at the
// commit before #1234 landed, NOT re-derived from anything this migration
// touches — a hardcoded oracle is the whole point, mirroring
// barbarian-2014-snapshot.test.ts's shape.
//
// This is a GUARD, not a red/green cycle: it is green on first run by
// construction (WIZARD_FEATURES is authored as a byte-identical copy in the
// same commit that adds this file). Its job is to catch commit 2 silently
// editing a 2014 row while authoring 2024 content.
import { describe, expect, it } from "vitest";

import { WIZARD_FEATURES } from "../wizard-features.js";

interface Pinned {
  subclassSlug: string | null;
  name: string;
  level: number;
  description: string;
}

const PRE_CHANGE_2014: Pinned[] = [
  // ---- Base class ------------------------------------------------------
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    subclassSlug: null,
    name: "Arcane Recovery",
    level: 1,
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
  },
  {
    subclassSlug: null,
    name: "Spell Mastery",
    level: 18,
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    subclassSlug: null,
    name: "Signature Spells",
    level: 20,
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
  // ---- School of Evocation -----------------------------------------------
  {
    subclassSlug: "wizard-school-of-evocation",
    name: "Evocation Savant",
    level: 2,
    description: "The gold and time you must spend to copy an evocation spell into your spellbook is halved.",
  },
  {
    subclassSlug: "wizard-school-of-evocation",
    name: "Sculpt Spells",
    level: 2,
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  {
    subclassSlug: "wizard-school-of-evocation",
    name: "Potent Cantrip",
    level: 6,
    description: "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none.",
  },
  {
    subclassSlug: "wizard-school-of-evocation",
    name: "Empowered Evocation",
    level: 10,
    description: "Add your Intelligence modifier to one damage roll of any evocation spell you cast.",
  },
  {
    subclassSlug: "wizard-school-of-evocation",
    name: "Overchannel",
    level: 14,
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
  // ---- School of Abjuration ------------------------------------------------
  {
    subclassSlug: "wizard-school-of-abjuration",
    name: "Abjuration Savant",
    level: 2,
    description: "The gold and time you must spend to copy an abjuration spell into your spellbook is halved.",
  },
  {
    subclassSlug: "wizard-school-of-abjuration",
    name: "Arcane Ward",
    level: 2,
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  {
    subclassSlug: "wizard-school-of-abjuration",
    name: "Projected Ward",
    level: 6,
    description: "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead.",
  },
  {
    subclassSlug: "wizard-school-of-abjuration",
    name: "Improved Abjuration",
    level: 10,
    description: "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check.",
  },
  {
    subclassSlug: "wizard-school-of-abjuration",
    name: "Spell Resistance",
    level: 14,
    description: "You have advantage on saving throws against spells, and resistance to spell damage.",
  },
  // ---- School of Illusion --------------------------------------------------
  {
    subclassSlug: "wizard-school-of-illusion",
    name: "Illusion Savant",
    level: 2,
    description: "The gold and time you must spend to copy an illusion spell into your spellbook is halved.",
  },
  {
    subclassSlug: "wizard-school-of-illusion",
    name: "Improved Minor Illusion",
    level: 2,
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  {
    subclassSlug: "wizard-school-of-illusion",
    name: "Malleable Illusions",
    level: 6,
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  {
    subclassSlug: "wizard-school-of-illusion",
    name: "Illusory Self",
    level: 10,
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
  },
  {
    subclassSlug: "wizard-school-of-illusion",
    name: "Illusory Reality",
    level: 14,
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
];

function key(p: { subclassSlug: string | null; name: string }): string {
  return `${p.subclassSlug ?? "null"}::${p.name}`;
}

describe("Wizard EDITION_2014 rows are byte-identical to the pre-#1234 tree (2014 is a transcription, not a rewrite)", () => {
  it("count matches: exactly the 19 pre-change 2014 features", () => {
    const actual2014 = WIZARD_FEATURES.filter((r) => r.edition === "EDITION_2014");
    expect(actual2014).toHaveLength(PRE_CHANGE_2014.length);
    expect(PRE_CHANGE_2014).toHaveLength(19);
  });

  it("every pinned (subclassSlug, name) has an EDITION_2014 row with the exact same level and description", () => {
    const byKey = new Map(WIZARD_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => [key(r), r]));
    for (const pinned of PRE_CHANGE_2014) {
      const actual = byKey.get(key(pinned));
      expect(actual, `missing EDITION_2014 row for ${key(pinned)}`).toBeDefined();
      expect(actual!.level, key(pinned)).toBe(pinned.level);
      expect(actual!.description, key(pinned)).toBe(pinned.description);
    }
  });

  it("no EXTRA EDITION_2014 row exists beyond the 19 pinned above", () => {
    const actualKeys = new Set(WIZARD_FEATURES.filter((r) => r.edition === "EDITION_2014").map((r) => key(r)));
    const pinnedKeys = new Set(PRE_CHANGE_2014.map((p) => key(p)));
    expect(actualKeys).toEqual(pinnedKeys);
  });
});
